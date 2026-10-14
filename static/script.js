const SPIN_DURATION_MS = 30_000;
const imageFiles = ["serect 1.jpg", "serect 2.jpg", "serect 3.jpg", "serect 4.jpg"];
const wheel = document.getElementById("wheel");
const ctx = wheel.getContext("2d");
const spinBtn = document.getElementById("spinBtn");
const statusText = document.getElementById("status");
const countdown = document.getElementById("countdown");
const images = imageFiles.map((file, index) => {
    if (!PRIZE_IMAGES[index]) return null;
    const img = new Image();
    img.src = `/prize-images/${encodeURIComponent(file)}`;
    img.onload = drawWheel;
    return img;
});

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
        const image = images[index];
        const imageSize = 106;
        const imageRadius = 157;
        if (image && image.complete && image.naturalWidth) {
            const x = center + Math.cos(middle) * imageRadius - imageSize / 2;
            const y = center + Math.sin(middle) * imageRadius - imageSize / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + imageSize / 2, y + imageSize / 2, imageSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(image, x, y, imageSize, imageSize);
            ctx.restore();
        } else {
            ctx.save();
            ctx.fillStyle = "rgba(255, 250, 244, .75)";
            ctx.beginPath();
            ctx.arc(center + Math.cos(middle) * imageRadius, center + Math.sin(middle) * imageRadius, 38, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#60483e";
            ctx.font = "32px Segoe UI Emoji, Segoe UI, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🎁", center + Math.cos(middle) * imageRadius, center + Math.sin(middle) * imageRadius);
            ctx.restore();
        }

        ctx.fillStyle = "#453c37";
        ctx.font = "700 20px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(prize, center + Math.cos(middle) * 76, center + Math.sin(middle) * 76);
    });

    ctx.beginPath();
    ctx.arc(center, center, 38, 0, Math.PI * 2);
    ctx.fillStyle = "#fffaf4";
    ctx.fill();
    ctx.strokeStyle = "#d9b7a3";
    ctx.lineWidth = 5;
    ctx.stroke();
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
        } else if (data.spin_in_progress) {
            spinBtn.disabled = true;
            spinBtn.textContent = "Đang quay…";
            statusText.textContent = "Vòng quay đang diễn ra. Vui lòng chờ kết quả.";
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

function updateCountdown(seconds) {
    countdown.textContent = `Vòng quay đang chạy · ${seconds} giây`;
}

async function spinWheel() {
    if (spinning || spinBtn.disabled) return;
    spinning = true;
    spinBtn.disabled = true;
    spinBtn.textContent = "Đang quay…";
    statusText.textContent = "Chúc bạn may mắn!";

    let spin;
    try {
        const response = await fetch("/api/spin/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        spin = await response.json();
        if (!response.ok) throw new Error(spin.error || "Không thể bắt đầu vòng quay.");
    } catch (error) {
        statusText.textContent = error.message;
        spinning = false;
        await refreshStatus();
        return;
    }

    const prizeIndex = spin.prize_index;
    const prizeName = PRIZES[prizeIndex];
    const sliceDegrees = 360 / PRIZES.length;
    // Slices are drawn starting at -90deg (12 o'clock); align this exact slice center to the pointer.
    const sectorCenterDegrees = -90 + prizeIndex * sliceDegrees + sliceDegrees / 2;
    const finalDegrees = 360 * 12 - 90 - sectorCenterDegrees;

    wheel.style.transition = "none";
    wheel.style.transform = "rotate(0deg)";
    wheel.getBoundingClientRect();
    requestAnimationFrame(() => {
        wheel.style.transition = `transform ${SPIN_DURATION_MS}ms cubic-bezier(.10,.72,.12,1)`;
        wheel.style.transform = `rotate(${finalDegrees}deg)`;
    });

    const startedAt = Date.now();
    updateCountdown(30);
    const timer = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((SPIN_DURATION_MS - (Date.now() - startedAt)) / 1000));
        if (remaining > 0) updateCountdown(remaining);
        else window.clearInterval(timer);
    }, 250);

    window.setTimeout(async () => {
        window.clearInterval(timer);
        try {
            const response = await fetch("/api/spin/finish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Không thể hoàn tất vòng quay.");

            document.getElementById("resultName").textContent = result.prize || prizeName;
            const resultImage = document.getElementById("resultImage");
            const resultFallback = document.getElementById("resultFallback");
            document.getElementById("resultFallbackName").textContent = result.prize || prizeName;
            resultFallback.classList.remove("hidden");
            resultImage.classList.add("hidden");
            resultImage.onerror = () => {
                resultImage.classList.add("hidden");
                resultFallback.classList.remove("hidden");
            };
            if (PRIZE_IMAGES[prizeIndex]) {
                resultImage.onload = () => {
                    resultImage.classList.remove("hidden");
                    resultFallback.classList.add("hidden");
                };
                resultImage.src = `/prize-images/${encodeURIComponent(imageFiles[prizeIndex])}`;
                resultImage.alt = result.prize || prizeName;
            }
            document.getElementById("result").classList.remove("hidden");
            countdown.textContent = "";
            statusText.textContent = "Cảm ơn bạn đã tham gia!";
            spinBtn.textContent = "ĐÃ QUAY XONG";
        } catch (error) {
            countdown.textContent = "";
            statusText.textContent = error.message;
            spinBtn.textContent = "Đang chờ hoàn tất…";
        } finally {
            spinning = false;
            await refreshStatus();
        }
    }, SPIN_DURATION_MS);
}

spinBtn.addEventListener("click", spinWheel);
drawWheel();
refreshStatus();
