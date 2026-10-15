const SPIN_DURATION_MS = 30_000;
const wheel = document.getElementById("wheel");
const ctx = wheel.getContext("2d");
const spinBtn = document.getElementById("spinBtn");
const statusText = document.getElementById("status");
const countdown = document.getElementById("countdown");
const colors = ["#e9a7a0", "#f4cc82", "#86b3a1", "#92a9d1"];
const segmentAngle = (Math.PI * 2) / PRIZES.length;
let spinning = false;

function drawWheel() {
    const center = wheel.width / 2;
    const radius = center - 8;
    ctx.clearRect(0, 0, wheel.width, wheel.height);

    PRIZES.forEach((prize, index) => {
        const start = index * segmentAngle - Math.PI / 2;
        const end = start + segmentAngle;
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = colors[index];
        ctx.fill();
        ctx.strokeStyle = "#fffaf4";
        ctx.lineWidth = 5;
        ctx.stroke();

        const middle = start + segmentAngle / 2;
        ctx.fillStyle = "#453c37";
        ctx.font = "700 23px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(prize, center + Math.cos(middle) * 120, center + Math.sin(middle) * 120);
    });

    ctx.beginPath();
    ctx.arc(center, center, 38, 0, Math.PI * 2);
    ctx.fillStyle = "#fffaf4";
    ctx.fill();
    ctx.strokeStyle = "#d9b7a3";
    ctx.lineWidth = 5;
    ctx.stroke();
}

function showPrizeResult(prizeIndex, prizeName = PRIZES[prizeIndex]) {
    if (!Number.isInteger(prizeIndex) || !PRIZES[prizeIndex]) return;

    document.getElementById("resultName").textContent = prizeName;
    document.getElementById("resultFallbackName").textContent = prizeName;
    const resultImage = document.getElementById("resultImage");
    const resultFallback = document.getElementById("resultFallback");
    const hasImage = Boolean(PRIZE_IMAGES[prizeIndex]);

    resultImage.onload = () => {
        resultImage.classList.remove("hidden");
        resultFallback.classList.add("hidden");
    };
    resultImage.onerror = () => {
        resultImage.classList.add("hidden");
        resultFallback.classList.remove("hidden");
    };

    if (hasImage) {
        resultImage.src = `/prize-images/${prizeIndex}`;
        resultImage.alt = prizeName;
        resultImage.classList.add("hidden");
        resultFallback.classList.remove("hidden");
    } else {
        resultImage.classList.add("hidden");
        resultFallback.classList.remove("hidden");
    }
    document.getElementById("result").classList.remove("hidden");
}

function getRemainingMs(startedAt) {
    const startedAtMs = Date.parse(startedAt);
    if (!Number.isFinite(startedAtMs)) return SPIN_DURATION_MS;
    const elapsed = Math.max(0, Date.now() - startedAtMs);
    return Math.max(0, SPIN_DURATION_MS - elapsed);
}

async function refreshStatus() {
    try {
        const response = await fetch("/api/status", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Không thể kiểm tra trạng thái.");

        if (!data.enabled) {
            spinBtn.disabled = true;
            spinBtn.textContent = "Vòng quay đã đóng";
            statusText.textContent = "Lượt quay duy nhất đã được sử dụng.";
            countdown.textContent = "";
            if (data.completed_at && Number.isInteger(data.prize_index)) {
                showPrizeResult(data.prize_index);
            }
        } else if (data.spin_in_progress) {
            spinBtn.disabled = true;
            spinBtn.textContent = "Đang quay…";
            statusText.textContent = "Vòng quay đang diễn ra. Vui lòng chờ kết quả.";
            if (!spinning && Number.isInteger(data.prize_index)) {
                runSpin(data.prize_index, data.started_at);
            }
        } else {
            spinBtn.disabled = false;
            spinBtn.textContent = "QUAY NGAY";
            statusText.textContent = "Sẵn sàng — bạn có một lượt quay.";
        }
    } catch (error) {
        spinBtn.disabled = true;
        spinBtn.textContent = "Vòng quay chưa sẵn sàng";
        statusText.textContent = error.message;
    }
}

function updateCountdown(startedAt) {
    const remaining = getRemainingMs(startedAt);
    const seconds = Math.ceil(remaining / 1000);
    countdown.textContent = seconds > 0
        ? `Vòng quay đang chạy · ${seconds} giây`
        : "Đang hoàn tất kết quả…";
}

async function finishSpin(prizeIndex) {
    try {
        const response = await fetch("/api/spin/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        const result = await response.json();

        if (response.status === 409) {
            const statusResponse = await fetch("/api/status", { cache: "no-store" });
            const status = await statusResponse.json();
            if (status.ok && !status.enabled && status.completed_at && Number.isInteger(status.prize_index)) {
                showPrizeResult(status.prize_index);
                countdown.textContent = "";
                statusText.textContent = "Lượt quay đã hoàn tất.";
                spinning = false;
                await refreshStatus();
                return;
            }
            if (status.ok && status.spin_in_progress) {
                const waitMs = Math.max(500, Math.min(1500, getRemainingMs(status.started_at) + 100));
                window.setTimeout(() => finishSpin(status.prize_index ?? prizeIndex), waitMs);
                return;
            }
        }
        if (!response.ok) throw new Error(result.error || "Không thể hoàn tất vòng quay.");

        const winningIndex = Number.isInteger(result.prize_index) ? result.prize_index : prizeIndex;
        showPrizeResult(winningIndex, result.prize || PRIZES[winningIndex]);
        countdown.textContent = "";
        statusText.textContent = "Cảm ơn bạn đã tham gia!";
        spinning = false;
        await refreshStatus();
    } catch (error) {
        statusText.textContent = `${error.message} Đang thử hoàn tất lại…`;
        window.setTimeout(() => finishSpin(prizeIndex), 2000);
    }
}

function runSpin(prizeIndex, startedAt) {
    if (spinning || !Number.isInteger(prizeIndex) || !PRIZES[prizeIndex]) return;
    spinning = true;
    spinBtn.disabled = true;
    spinBtn.textContent = "Đang quay…";
    statusText.textContent = "Chúc bạn may mắn!";

    const actualStartedAt = startedAt || new Date().toISOString();
    const remainingMs = getRemainingMs(actualStartedAt);
    const sliceDegrees = 360 / PRIZES.length;
    const sectorCenterDegrees = -90 + prizeIndex * sliceDegrees + sliceDegrees / 2;
    const targetOffset = ((-90 - sectorCenterDegrees) % 360 + 360) % 360;
    const turnsLeft = 12 * (remainingMs / SPIN_DURATION_MS);
    const finalDegrees = 360 * turnsLeft + targetOffset;

    wheel.style.transition = "none";
    wheel.style.transform = "rotate(0deg)";
    wheel.getBoundingClientRect();
    if (remainingMs > 0) {
        requestAnimationFrame(() => {
            wheel.style.transition = `transform ${remainingMs}ms cubic-bezier(.10,.72,.12,1)`;
            wheel.style.transform = `rotate(${finalDegrees}deg)`;
        });
    } else {
        wheel.style.transform = `rotate(${targetOffset}deg)`;
    }

    updateCountdown(actualStartedAt);
    const timer = window.setInterval(() => updateCountdown(actualStartedAt), 250);
    window.setTimeout(() => {
        window.clearInterval(timer);
        updateCountdown(actualStartedAt);
        finishSpin(prizeIndex);
    }, remainingMs);
}

async function spinWheel() {
    if (spinning || spinBtn.disabled) return;
    spinBtn.disabled = true;
    spinBtn.textContent = "Đang quay…";
    statusText.textContent = "Đang bắt đầu vòng quay…";

    try {
        const response = await fetch("/api/spin/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        const spin = await response.json();
        if (!response.ok) throw new Error(spin.error || "Không thể bắt đầu vòng quay.");
        runSpin(spin.prize_index, spin.started_at);
    } catch (error) {
        statusText.textContent = error.message;
        await refreshStatus();
    }
}

spinBtn.addEventListener("click", spinWheel);
drawWheel();
refreshStatus();
