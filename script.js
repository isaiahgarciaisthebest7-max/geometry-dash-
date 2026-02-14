const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mainMenu = document.getElementById('main-menu');
const hud = document.getElementById('hud');
const progressFill = document.getElementById('progress-fill');
const attemptSpan = document.getElementById('attempt-count');
const crashFlash = document.getElementById('crash-flash');

canvas.width = 800;
canvas.height = 450;

// --- PHYSICS CONSTANTS (Tuned for 60Hz) ---
const PHY = {
    GRAVITY: 0.65,
    JUMP_FORCE: -10.5,
    SHIP_LIFT: -0.35,
    SHIP_GRAVITY: 0.25,
    TERMINAL_VEL: 12,
    SPEED: 6.5,
    GROUND: 380,
    BLOCK_SIZE: 40
};

// --- LEVEL DATA (Grid System) ---
// x = grid x position, y = grid y height (0 is floor), t = type
// Types: 1=Block, 2=Spike, 3=Ship Portal, 4=Cube Portal
const LEVELS = [
    // Level 1: Stereo Madness
    [
        {x: 10, y: 0, t: 2}, {x: 20, y: 0, t: 1}, {x: 25, y: 0, t: 2}, 
        {x: 35, y: 0, t: 1}, {x: 36, y: 0, t: 1}, {x: 42, y: 0, t: 2}, {x: 43, y: 0, t: 2},
        {x: 55, y: 2, t: 3}, // Ship
        {x: 65, y: 3, t: 1}, {x: 75, y: 6, t: 1}, {x: 85, y: 3, t: 1},
        {x: 100, y: 0, t: 4}, // Cube
        {x: 110, y: 0, t: 2}, {x: 111, y: 0, t: 2}, {x: 112, y: 0, t: 2} // Triple
    ],
    // Level 2: Back on Track
    [
        {x: 5, y: 0, t: 2}, {x: 15, y: 1, t: 1}, {x: 18, y: 2, t: 1}, {x: 21, y: 3, t: 1},
        {x: 30, y: 0, t: 2}, {x: 31, y: 0, t: 2},
        {x: 40, y: 2, t: 3}, // Ship
        {x: 50, y: 1, t: 1}, {x: 50, y: 8, t: 1},
        {x: 60, y: 2, t: 1}, {x: 60, y: 7, t: 1},
        {x: 80, y: 0, t: 4}, // Cube
        {x: 90, y: 0, t: 1}, {x: 95, y: 0, t: 2}, {x: 100, y: 0, t: 1}
    ],
    // Level 3: Hard
    [
        {x: 10, y: 0, t: 2}, {x: 11, y: 0, t: 2}, {x: 12, y: 0, t: 2},
        {x: 25, y: 2, t: 3}, // Ship
        {x: 40, y: 4, t: 1}, {x: 50, y: 2, t: 1}, {x: 60, y: 6, t: 1},
        {x: 80, y: 0, t: 4}, // Cube
        {x: 90, y: 0, t: 2}, {x: 95, y: 1, t: 2}, {x: 100, y: 0, t: 2}
    ]
];

// --- GAME STATE ---
let gameState = {
    mode: "MENU", // MENU, PLAYING, CRASHED
    levelIndex: 0,
    objects: [],
    cameraX: 0,
    attempts: 1,
    levelLength: 0
};

let player = {
    x: 200, y: 0, w: 30, h: 30,
    dy: 0,
    mode: 'CUBE',
    rotation: 0,
    onGround: false,
    dead: false
};

let input = { hold: false, jumpPressed: false };

// --- INPUT HANDLING ---
function bindInput() {
    const handleDown = () => {
        if (gameState.mode === "PLAYING") {
            input.hold = true;
            input.jumpPressed = true;
        }
    };
    const handleUp = () => input.hold = false;

    window.addEventListener('mousedown', handleDown);
    window.addEventListener('touchstart', (e) => { e.preventDefault(); handleDown(); }, {passive: false});
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') handleDown();
    });

    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') handleUp();
    });
}

// --- LEVEL MANAGEMENT ---
function startLevel(index) {
    gameState.levelIndex = index;
    gameState.attempts = 1;
    attemptSpan.innerText = gameState.attempts;
    loadLevelData(index);
    
    mainMenu.style.display = 'none';
    hud.style.display = 'block';
    gameState.mode = "PLAYING";
    
    // Start Loop
    lastTime = performance.now();
    requestAnimationFrame(loop);
}

function loadLevelData(index) {
    // Convert Grid coordinates to Pixel coordinates
    gameState.objects = LEVELS[index].map(obj => ({
        x: obj.x * PHY.BLOCK_SIZE,
        y: PHY.GROUND - (obj.y * PHY.BLOCK_SIZE) - PHY.BLOCK_SIZE, // Invert Y for grid (0 is bottom)
        type: obj.t,
        w: PHY.BLOCK_SIZE, h: PHY.BLOCK_SIZE
    }));
    
    // Calculate level length for progress bar
    if (gameState.objects.length > 0) {
        gameState.levelLength = gameState.objects[gameState.objects.length-1].x + 500;
    }
    
    resetPlayer();
}

function resetPlayer() {
    player.x = 200;
    player.y = PHY.GROUND - player.h;
    player.dy = 0;
    player.mode = 'CUBE';
    player.rotation = 0;
    player.dead = false;
    player.onGround = true;
    gameState.cameraX = 0;
}

function exitToMenu() {
    gameState.mode = "MENU";
    mainMenu.style.display = 'flex';
    hud.style.display = 'none';
}

function crash() {
    if (player.dead) return;
    player.dead = true;
    gameState.attempts++;
    attemptSpan.innerText = gameState.attempts;
    
    // Visual Flash
    crashFlash.classList.add('flash-active');
    setTimeout(() => crashFlash.classList.remove('flash-active'), 100);

    setTimeout(() => {
        resetPlayer();
    }, 600);
}

// --- PHYSICS ENGINE (Fixed Time Step) ---
function updatePhysics() {
    if (player.dead || gameState.mode !== "PLAYING") return;

    // 1. Move Camera
    gameState.cameraX += PHY.SPEED;

    // 2. Apply Forces
    let wasOnGround = player.onGround; // Track previous state for "landing" logic
    let prevY = player.y; // Track previous Y for collision resolution

    if (player.mode === 'CUBE') {
        player.dy += PHY.GRAVITY;
        
        // Floor Collision
        if (player.y + player.h >= PHY.GROUND) {
            player.y = PHY.GROUND - player.h;
            player.dy = 0;
            player.onGround = true;
            player.rotation = Math.round(player.rotation / 90) * 90; 
        } else {
            player.onGround = false;
            player.rotation += 5;
        }

        // Jump (Buffer jump logic included)
        if (input.hold && player.onGround) {
            player.dy = PHY.JUMP_FORCE;
            player.onGround = false;
            input.jumpPressed = false; // Consume press
        }
    } 
    else if (player.mode === 'SHIP') {
        player.dy += input.hold ? PHY.SHIP_LIFT : PHY.SHIP_GRAVITY;
        player.rotation = player.dy * 2.5;
        
        // Ceiling/Floor Limits
        if (player.y < 0) { player.y = 0; player.dy = 0; }
        if (player.y + player.h > PHY.GROUND) {
            player.y = PHY.GROUND - player.h;
            player.dy = 0;
            player.rotation = 0;
        }
    }

    // Terminal Velocity
    if (player.dy > PHY.TERMINAL_VEL) player.dy = PHY.TERMINAL_VEL;

    // 3. Move Player Y
    player.y += player.dy;

    // 4. Object Collision
    let pRect = {
        l: gameState.cameraX + player.x + 6, // Hitbox padding
        r: gameState.cameraX + player.x + player.w - 6,
        t: player.y + 6,
        b: player.y + player.h - 2
    };

    // Optimization: Only check objects near player
    let nearby = gameState.objects.filter(o => 
        o.x > gameState.cameraX + 100 && o.x < gameState.cameraX + 500
    );

    for (let obj of nearby) {
        // AABB Collision
        if (pRect.r > obj.x && pRect.l < obj.x + obj.w &&
            pRect.b > obj.y && pRect.t < obj.y + obj.h) {
            
            // --- SPIKE (Type 2) ---
            if (obj.type === 2) {
                // Precise spike hitbox (triangle)
                let spikeCenterX = obj.x + obj.w/2;
                if (Math.abs((gameState.cameraX + player.x + 15) - spikeCenterX) < 15) {
                    crash();
                }
            }
            
            // --- PORTALS (Type 3 & 4) ---
            if (obj.type === 3) player.mode = 'SHIP';
            if (obj.type === 4) player.mode = 'CUBE';

            // --- BLOCK (Type 1) ---
            if (obj.type === 1) {
                // Block Logic: 
                // If we were above the block in the previous frame AND falling -> Land
                // Otherwise -> Die
                
                // Calculate "Previous Bottom" using the previous Y
                let prevBottom = prevY + player.h;
                
                // Allow a small margin of error (15px) for high speed falling
                if (prevBottom <= obj.y + 15 && player.dy >= 0) {
                    player.y = obj.y - player.h;
                    player.dy = 0;
                    player.onGround = true;
                    if (player.mode === 'CUBE') player.rotation = Math.round(player.rotation / 90) * 90;
                } else {
                    crash(); // Hit side or bottom
                }
            }
        }
    }

    // Level Complete Check
    if (gameState.cameraX > gameState.levelLength) {
        exitToMenu(); // Or load next level
    }

    // Update Progress UI
    let pct = Math.min((gameState.cameraX / gameState.levelLength) * 100, 100);
    progressFill.style.width = pct + '%';
}

// --- RENDERER ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dynamic Background
    let bgCol = player.mode === 'SHIP' ? '#1a0022' : '#001133';
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor
    ctx.fillStyle = '#000';
    ctx.fillRect(0, PHY.GROUND, canvas.width, canvas.height - PHY.GROUND);
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, PHY.GROUND); ctx.lineTo(canvas.width, PHY.GROUND); ctx.stroke();

    // Draw Objects
    gameState.objects.forEach(obj => {
        let drawX = obj.x - gameState.cameraX;
        if (drawX > -50 && drawX < 850) {
            
            // BLOCK
            if (obj.type === 1) {
                // Outline only with slight fill
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.strokeRect(drawX, obj.y, obj.w, obj.h);
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(drawX, obj.y, obj.w, obj.h);
            } 
            // SPIKE
            else if (obj.type === 2) {
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.moveTo(drawX, obj.y + obj.h);
                ctx.lineTo(drawX + obj.w/2, obj.y);
                ctx.lineTo(drawX + obj.w, obj.y + obj.h);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            } 
            // PORTALS
            else if (obj.type === 3 || obj.type === 4) {
                ctx.fillStyle = obj.type === 3 ? 'pink' : 'cyan';
                ctx.fillRect(drawX, 0, 40, 450);
            }
        }
    });

    // Draw Player
    if (!player.dead) {
        ctx.save();
        ctx.translate(player.x + player.w/2, player.y + player.h/2);
        ctx.rotate(player.rotation * Math.PI / 180);
        
        ctx.fillStyle = player.mode === 'SHIP' ? '#ff55aa' : '#00ffff';
        ctx.fillRect(-player.w/2, -player.w/2, player.w, player.w);
        
        // Inner square
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(-player.w/2 + 5, -player.w/2 + 5, player.w - 10, player.w - 10);
        
        ctx.restore();
    }
}

// --- GAME LOOP (Fixed Time Step) ---
let lastTime = 0;
let accumulator = 0;
const STEP = 1/60;

function loop(timestamp) {
    if (gameState.mode !== "PLAYING") return;
    if (!lastTime) lastTime = timestamp;
    let deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Cap deltaTime to prevent "spiral of death" on lag spikes
    if (deltaTime > 0.1) deltaTime = 0.1;

    accumulator += deltaTime;

    while (accumulator >= STEP) {
        updatePhysics();
        accumulator -= STEP;
    }

    draw();
    requestAnimationFrame(loop);
}

// Initialize
bindInput();
