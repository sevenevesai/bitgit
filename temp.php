<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Seveneves AI</title>
<style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        background: #fafafa;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    .universe {
        position: fixed;
        width: 100%;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .logo-container {
        position: relative;
        z-index: 10;
    }

    .logo {
        width: 200px;
        height: 200px;
        position: relative;
        z-index: 2;
        cursor: pointer;
        transition: transform 0.3s ease;
    }

    .logo:hover {
        transform: scale(1.05);
    }

    /* Orbiting Products */
    .orbit-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    .orbit {
        position: absolute;
        border: 1px dashed rgba(17, 17, 17, 0.1);
        border-radius: 50%;
        animation: pulse 4s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.1; }
    }

    .product {
        position: absolute;
        width: 40px;
        height: 40px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.3s ease;
        pointer-events: all;
        overflow: hidden;
    }

    .product img {
        width: 28px;
        height: 28px;
        transition: transform 0.3s ease;
    }

    .product:hover {
        transform: scale(1.15);
        box-shadow: 0 6px 30px rgba(0, 0, 0, 0.15);
    }

    .product:hover img {
        transform: scale(1.1);
    }

    .product-info {
        position: absolute;
        bottom: -30px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    }

    .product:hover .product-info {
        opacity: 1;
    }

    /* Canvas styles */
    #rotatingCircleCanvas {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    #snowCanvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    /* Responsive */
    @media (max-width: 640px) {
        .logo {
            width: 80px;
            height: 80px;
        }

        .product {
            width: 32px;
            height: 32px;
        }

        .product img {
            width: 22px;
            height: 22px;
        }
    }
</style>
<link rel="icon" href="assets/images/logo64.ico" type="image/x-icon">
</head>
<body>
<div class="universe">
    <div class="orbit-container" id="orbitContainer"></div>
    <div class="logo-container">
        <img src="assets/images/logo250.png" alt="Seveneves Logo" class="logo" id="logo">
        <canvas id="rotatingCircleCanvas"></canvas>
    </div>
</div>
<canvas id="snowCanvas"></canvas>

<script>
    // Canvas setup
    const canvas = document.getElementById('snowCanvas');
    const ctx = canvas.getContext('2d');
    const circleCanvas = document.getElementById('rotatingCircleCanvas');
    const circleCtx = circleCanvas.getContext('2d');
    const circleCanvasBuffer = 10;
    const circleCanvasRadius = 180;
    const dissolveFlakes = [];

    let snowflakes = [];
    let angle = 0;
    let orbitAngle = 0;
    let lastOrbitTime = performance.now();

    // Product configuration
    const products = [
        {
            name: 'Capsula',
            icon: '/capsula/icons/32.png',
            url: '/capsula',
            orbit: 240,
            phase: 0 // 0 degrees
        },
        {
            name: 'Pixel Assets',
            icon: '/pixels/icons/32.png',
            url: '/pixels',
            orbit: 240,
            phase: Math.PI / 2 // 90 degrees
        },
        {
            name: 'Graal RC',
            icon: '/graalrc/icon-1.png',
            url: '/graalrc',
            orbit: 240,
            phase: Math.PI // 180 degrees
        },
        {
            name: 'BitGit',
            icon: '/bitgit/icon.png',
            url: '/bitgit',
            orbit: 240,
            phase: (3 * Math.PI) / 2 // 270 degrees
        }
    ];

    const orbitSpeed = 0.0003;

    // Create orbiting products
    function createOrbits() {
        const container = document.getElementById('orbitContainer');
        
        products.forEach((product, index) => {
            // Create orbit path (only one orbit ring needed now)
            if (index === 0) {
                const orbitDiv = document.createElement('div');
                orbitDiv.className = 'orbit';
                orbitDiv.style.width = `${product.orbit * 2}px`;
                orbitDiv.style.height = `${product.orbit * 2}px`;
                orbitDiv.style.left = `${-product.orbit}px`;
                orbitDiv.style.top = `${-product.orbit}px`;
                container.appendChild(orbitDiv);
            }

            // Create product element
            const productDiv = document.createElement('div');
            productDiv.className = 'product';
            productDiv.innerHTML = `
                <img src="${product.icon}" alt="${product.name}">
                <span class="product-info">${product.name}</span>
            `;
            productDiv.onclick = () => window.location.href = product.url;
            
            container.appendChild(productDiv);
            product.element = productDiv;
        });
    }

    // Animate products in orbits
    function animateOrbits() {
        const now = performance.now();
        // Cap delta to 50ms to prevent jumps when tab is inactive
        const delta = Math.min(now - lastOrbitTime, 50);
        lastOrbitTime = now;

        orbitAngle += delta * orbitSpeed;

        products.forEach(product => {
            const currentAngle = orbitAngle + product.phase;
            const x = Math.cos(currentAngle) * product.orbit;
            const y = Math.sin(currentAngle) * product.orbit;

            product.element.style.transform = `translate(${x - 20}px, ${y - 20}px)`;
        });

        requestAnimationFrame(animateOrbits);
    }

    // Initialize orbits
    createOrbits();
    animateOrbits();

    // Canvas sizing
    function setCanvasSize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', setCanvasSize);
    setCanvasSize();

    function setCircleCanvasSize() {
        const displaySize = (circleCanvasRadius * 2) + circleCanvasBuffer;
        const resolutionMultiplier = 2;
        circleCanvas.width = displaySize * resolutionMultiplier;
        circleCanvas.height = displaySize * resolutionMultiplier;
        circleCanvas.style.width = `${displaySize}px`;
        circleCanvas.style.height = `${displaySize}px`;
        circleCtx.setTransform(resolutionMultiplier, 0, 0, resolutionMultiplier, 0, 0);
    }

    function drawRotatingCircle() {
        circleCtx.clearRect(0, 0, circleCanvas.width, circleCanvas.height);
        const centerX = circleCanvas.width / 2 / 2;
        const centerY = circleCanvas.height / 2 / 2;

        circleCtx.save();
        circleCtx.translate(centerX, centerY);
        circleCtx.rotate(angle);
        circleCtx.translate(-centerX, -centerY);

        const lineThickness = 4;
        const segments = 12;
        const gapAngle = Math.PI / 12;

        circleCtx.lineWidth = lineThickness;
        circleCtx.strokeStyle = '#111';
        circleCtx.lineCap = 'round';

        for (let i = 0; i < segments; i++) {
            const startAngle = (i * 2 * Math.PI) / segments;
            const endAngle = startAngle + (2 * Math.PI / segments) - gapAngle;

            circleCtx.beginPath();
            circleCtx.arc(centerX, centerY, circleCanvasRadius, startAngle, endAngle);
            circleCtx.stroke();
        }

        circleCtx.restore();
        angle += 0.0006;
        requestAnimationFrame(drawRotatingCircle);
    }

    setCircleCanvasSize();
    drawRotatingCircle();
</script>
</body>
</html>