let mode = 'move'; 
let currentType = 'association';
let selectedSource = null;
let draggedElement = null;
let connections = [];
let offset = { x: 0, y: 0 };
let classCounter = 0;
let rightClickedClassId = null;

let draggedHandle = null; 
let currentSnapPort = null;

// --- Panning Variables ---
let isPanning = false;
let startPan = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 }; 

const canvas = document.getElementById('canvas');
const svgLayer = document.getElementById('svg-layer');
const statusMsg = document.getElementById('status-msg');
const contextMenu = document.getElementById('context-menu');
const helpModal = document.getElementById('help-modal');

// --- NEW: Floating Input Element ---
const floatInput = document.getElementById('floating-input');
let editingLabel = null; // เก็บว่ากำลังแก้ Label ตัวไหนอยู่

// --- Helper: Toggle Modal ---
function toggleHelp() {
    helpModal.style.display = (helpModal.style.display === "block") ? "none" : "block";
}
window.onclick = function(event) {
    if (event.target == helpModal) helpModal.style.display = "none";
}

// --- Panning Logic ---
window.addEventListener('mousedown', (e) => {
    // ถ้าคลิกขวาที่ว่าง หรือคลิกซ้ายเพื่อลาก (แต่ต้องไม่อยู่ในโหมดแก้ Text)
    if (e.button === 2 && mode === 'move' && !e.target.closest('.uml-class') && !e.target.closest('#context-menu')) {
        isPanning = true;
        startPan = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
        document.body.classList.add('panning');
    }
});

window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        e.preventDefault();
        panOffset.x = e.clientX - startPan.x;
        panOffset.y = e.clientY - startPan.y;
        applyPan();
    }
});

window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        document.body.classList.remove('panning');
    }
});

function applyPan() {
    svgLayer.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
    canvas.style.backgroundPosition = `${panOffset.x}px ${panOffset.y}px`;
    
    // Canvas transform (ระวัง Toolbar ถ้ามันอยู่ในนี้ แต่ HTML นี้ Toolbar อยู่นอก)
    canvas.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
    
    // ซ่อน Input ถ้ามีการเลื่อนจอ
    hideFloatInput();
}

// --- Class & Ports ---
function addClass() {
    classCounter++;
    const div = document.createElement('div');
    div.className = 'uml-class';
    div.id = 'class-' + classCounter;
    
    const centerX = (-panOffset.x + window.innerWidth / 2) - 90;
    const centerY = (-panOffset.y + window.innerHeight / 2) - 50;
    
    div.style.left = centerX + 'px';
    div.style.top = centerY + 'px';
    div.style.zIndex = 10;
    div.innerHTML = `
        <div class="uml-header" ondblclick="enableEdit(this)">Class ${classCounter}</div>
        <div class="uml-attributes"></div>
        <div class="uml-methods"></div>
    `;
    div.addEventListener('mousedown', onMouseDown);
    div.addEventListener('click', onClassClick);
    div.addEventListener('contextmenu', onRightClick);
    canvas.appendChild(div);
    initPorts(div); 
    if(mode !== 'delete') setMode('move');
}

function initPorts(classEl) {
    for(let i=0; i<12; i++) {
        const p = document.createElement('div');
        p.className = 'snap-port';
        p.dataset.portIndex = i;
        classEl.appendChild(p);
    }
    updatePortsPosition(classEl);
}

function updatePortsPosition(classEl) {
    if(!classEl) return;
    const w = classEl.offsetWidth;
    const h = classEl.offsetHeight;
    const ports = classEl.querySelectorAll('.snap-port');
    const coords = [
        {x: w*0.25, y:0, s:'top'}, {x: w*0.5, y:0, s:'top'}, {x: w*0.75, y:0, s:'top'},       
        {x: w, y: h*0.25, s:'right'}, {x: w, y: h*0.5, s:'right'}, {x: w, y: h*0.75, s:'right'},    
        {x: w*0.75, y:h, s:'bottom'}, {x: w*0.5, y:h, s:'bottom'}, {x: w*0.25, y:h, s:'bottom'},       
        {x: 0, y: h*0.75, s:'left'}, {x: 0, y: h*0.5, s:'left'}, {x: 0, y: h*0.25, s:'left'}     
    ];
    ports.forEach((p, i) => {
        if(coords[i]) {
            p.style.left = coords[i].x + 'px';
            p.style.top = coords[i].y + 'px';
            p.dataset.side = coords[i].s; 
        }
    });
}

// --- Menu ---
function onRightClick(e) {
    e.preventDefault();
    if(isPanning) return; 

    rightClickedClassId = e.currentTarget.id;
    contextMenu.style.display = 'block';
    contextMenu.style.left = (e.pageX - panOffset.x) + 'px';
    contextMenu.style.top = (e.pageY - panOffset.y) + 'px';
}
document.addEventListener('click', e => { 
    if (e.button !== 2) contextMenu.style.display = 'none'; 
});

function triggerAddAttribute() { addClassItem('.uml-attributes', '- attribute'); }
function triggerAddMethod() { addClassItem('.uml-methods', '+ method()'); }

function addClassItem(selector, text) {
    if (!rightClickedClassId) return;
    
    // 1. เพิ่มข้อมูลใหม่เข้าไป
    const classEl = document.getElementById(rightClickedClassId);
    const container = classEl.querySelector(selector);
    const item = document.createElement('div');
    item.className = 'uml-item'; item.innerText = text;
    item.setAttribute('ondblclick', 'enableEdit(this)');
    container.appendChild(item);
    
    // 2. เปิดโหมดแก้ไข
    enableEdit(item); 
    
    // --- แก้ไขตรงนี้: สั่งอัปเดตตำแหน่ง Port ใหม่ทันทีหลังจากกล่องขยาย ---
    // ใช้ requestAnimationFrame เพื่อรอให้ Browser วาดกล่องที่ขยายแล้วเสร็จก่อน
    requestAnimationFrame(() => {
        updatePortsPosition(classEl); // คำนวณจุดเชื่อมใหม่ตามความสูงใหม่
        updateLines();                // วาดเส้นใหม่ตามจุดใหม่
    });
}

function triggerDeleteClass() { 
    if(rightClickedClassId) {
        deleteClass(rightClickedClassId);
        rightClickedClassId = null;
    }
}

// --- Modes ---
function setMode(newMode, type = null) {
    mode = newMode; selectedSource = null;
    if (type) currentType = type;
    document.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.uml-class').forEach(el => el.classList.remove('source-selected'));
    document.body.classList.remove('mode-delete');
    
    if (mode === 'move') {
        document.getElementById('btn-move').classList.add('active');
        statusMsg.style.display = 'none'; canvas.style.cursor = 'default';
    } else if (mode === 'delete') {
        document.getElementById('btn-delete-mode').classList.add('active');
        document.body.classList.add('mode-delete');
        statusMsg.style.display = 'block'; statusMsg.innerText = `[Eraser] คลิกเพื่อลบ`;
    } else {
        document.getElementById('btn-' + currentType).classList.add('active');
        statusMsg.style.display = 'block'; statusMsg.innerText = `[${currentType}] เลือกต้นทาง`;
        canvas.style.cursor = 'crosshair';
    }
}

function onClassClick(e) {
    if (e.target.isContentEditable) return;
    e.stopPropagation();
    const targetId = e.currentTarget.id;
    
    if (mode === 'delete') { deleteClass(targetId); return; }
    
    if (mode === 'connect') {
        if (!selectedSource) {
            selectedSource = targetId;
            e.currentTarget.classList.add('source-selected');
            statusMsg.innerText = `[${currentType}] เลือกปลายทาง`;
        } else {
            if (selectedSource !== targetId) createLine(selectedSource, targetId, currentType);
            document.getElementById(selectedSource).classList.remove('source-selected');
            selectedSource = null; setMode('move');
        }
    }
}

function deleteClass(classId) {
    const el = document.getElementById(classId); if(el) el.remove();
    const toRemove = connections.filter(c => c.from === classId || c.to === classId);
    toRemove.forEach(c => deleteConnection(c, true));
    connections = connections.filter(c => c.from !== classId && c.to !== classId);
    if (rightClickedClassId === classId) rightClickedClassId = null;
    updateLines();
}

function createLine(sourceId, targetId, type) {
    // Default values
    let startText = "1";
    let endText = "1";

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection');
    if (type === 'inheritance') path.setAttribute('marker-end', 'url(#marker-inheritance)');
    else if (type === 'aggregation') path.setAttribute('marker-start', 'url(#marker-aggregation)');
    else if (type === 'composition') path.setAttribute('marker-start', 'url(#marker-composition)');
    
    const startHandle = createHandle('start');
    const endHandle = createHandle('end');
    const startLabel = createLabel(startText);
    const endLabel = createLabel(endText);

    const connObj = { 
        from: sourceId, to: targetId, pathElement: path, type: type,
        startHandle: startHandle, endHandle: endHandle,
        startLabel: startLabel, endLabel: endLabel,
        fromPortIndex: null, toPortIndex: null,
        startSide: null, endSide: null
    };
    
    setupHandleDrag(startHandle, connObj, true);
    setupHandleDrag(endHandle, connObj, false);

    path.addEventListener('click', (e) => {
        if (mode === 'delete') { e.stopPropagation(); deleteConnection(connObj); }
    });
    path.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        connObj.fromPortIndex = null; connObj.toPortIndex = null;
        updateLines();
    });

    svgLayer.appendChild(path);
    svgLayer.appendChild(startHandle);
    svgLayer.appendChild(endHandle);
    svgLayer.appendChild(startLabel);
    svgLayer.appendChild(endLabel);
    
    connections.push(connObj);
    updateLines();
}

function createHandle(type) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', 'conn-handle ' + type);
    return c;
}

// --- NEW: Create Label with Floating Input Trigger ---
function createLabel(text) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('class', 'label-text');
    t.textContent = text;
    
    // Prevent click through
    t.addEventListener('mousedown', (e) => e.stopPropagation());
    t.addEventListener('click', (e) => e.stopPropagation());

    // Double click to Activate Floating Input
    t.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showFloatInput(e, t);
    });
    return t;
}

// --- NEW: Floating Input Logic ---
function showFloatInput(e, labelEl) {
    editingLabel = labelEl;
    
    // ตั้งค่า Input
    floatInput.value = labelEl.textContent;
    floatInput.style.display = 'block';
    
    // วางตำแหน่ง Input
    floatInput.style.left = e.clientX + 'px';
    floatInput.style.top = e.clientY + 'px';
    
    // บังคับให้ browser วาด UI ใหม่ก่อนจะสั่ง Animation
    setTimeout(() => {
        floatInput.classList.add('active');
        floatInput.focus(); // บังคับ Focus
        floatInput.select(); // เลือกข้อความทั้งหมด
    }, 10);
}

function hideFloatInput() {
    floatInput.classList.remove('active');
    setTimeout(() => {
        if(!floatInput.classList.contains('active')) {
            floatInput.style.display = 'none';
        }
    }, 100);
    editingLabel = null;
}

// Save logic when Enter or Blur
function saveFloatInput() {
    if (editingLabel && floatInput.style.display !== 'none') {
        const val = floatInput.value.trim();
        if(val !== "") {
            editingLabel.textContent = val;
        }
        hideFloatInput();
    }
}

// Event Listeners for Floating Input
floatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveFloatInput();
    } else if (e.key === 'Escape') {
        hideFloatInput();
    }
});
// ถ้าคลิกข้างนอก Input ให้ Save
floatInput.addEventListener('blur', () => {
    saveFloatInput();
});


function deleteConnection(conn, skipArrayFilter = false) {
    svgLayer.removeChild(conn.pathElement);
    svgLayer.removeChild(conn.startHandle);
    svgLayer.removeChild(conn.endHandle);
    if(conn.startLabel) svgLayer.removeChild(conn.startLabel);
    if(conn.endLabel) svgLayer.removeChild(conn.endLabel);
    if(!skipArrayFilter) {
        connections = connections.filter(c => c !== conn);
        updateLines();
    }
}

// --- Magnetic & Dragging ---
function setupHandleDrag(handle, conn, isStart) {
    handle.addEventListener('mousedown', (e) => {
        if(mode !== 'move') return;
        e.stopPropagation();
        draggedHandle = { handle, conn, isStart };
        document.body.classList.add('dragging-handle');
        window.addEventListener('mousemove', onHandleMouseMove);
        window.addEventListener('mouseup', onHandleMouseUp);
    });
}

function onHandleMouseMove(e) {
    if(!draggedHandle) return;
    document.querySelectorAll('.snap-port.active').forEach(p => p.classList.remove('active'));
    currentSnapPort = null;

    const targetClassId = draggedHandle.isStart ? draggedHandle.conn.from : draggedHandle.conn.to;
    const classEl = document.getElementById(targetClassId);
    
    const mx = e.clientX - panOffset.x;
    const my = e.clientY - panOffset.y;
    let drawX, drawY;
    
    const nearest = findNearestPort(mx, my, classEl); 

    if (nearest) {
        currentSnapPort = nearest;
        currentSnapPort.element.classList.add('active');
        const portEl = currentSnapPort.element;
        const classEl = portEl.closest('.uml-class');
        
        drawX = parseFloat(classEl.style.left) + parseFloat(portEl.style.left);
        drawY = parseFloat(classEl.style.top) + parseFloat(portEl.style.top);
    } else {
        drawX = mx;
        drawY = my;
    }
    
    draggedHandle.handle.setAttribute('cx', drawX);
    draggedHandle.handle.setAttribute('cy', drawY);
    updateSingleLineManual(draggedHandle.conn, drawX, drawY, draggedHandle.isStart);
}

function onHandleMouseUp(e) {
    if(!draggedHandle) return;
    document.body.classList.remove('dragging-handle');
    if(currentSnapPort) currentSnapPort.element.classList.remove('active');

    if(currentSnapPort) {
        if(draggedHandle.isStart) draggedHandle.conn.fromPortIndex = currentSnapPort.index;
        else draggedHandle.conn.toPortIndex = currentSnapPort.index;
    } else {
        if(draggedHandle.isStart) draggedHandle.conn.fromPortIndex = null;
        else draggedHandle.conn.toPortIndex = null;
    }

    draggedHandle = null; currentSnapPort = null;
    window.removeEventListener('mousemove', onHandleMouseMove);
    window.removeEventListener('mouseup', onHandleMouseUp);
    updateLines();
}

function findNearestPort(mx, my, classEl) {
    if(!classEl) return null;
    const ports = classEl.querySelectorAll('.snap-port');
    let minDist = 30; let found = null;
    const classX = parseFloat(classEl.style.left);
    const classY = parseFloat(classEl.style.top);

    ports.forEach(p => {
        const px = classX + parseFloat(p.style.left);
        const py = classY + parseFloat(p.style.top);
        const dist = Math.hypot(mx - px, my - py);
        if(dist < minDist) { minDist = dist; found = { element: p, index: parseInt(p.dataset.portIndex) }; }
    });
    return found;
}

// --- Dragging Class ---
function onMouseDown(e) {
    if (e.target.isContentEditable || mode !== 'move' || e.button === 2) return; 
    draggedElement = e.currentTarget;
    document.querySelectorAll('.uml-class').forEach(el => el.style.zIndex = 10);
    draggedElement.style.zIndex = 100;

    const mouseX = e.clientX - panOffset.x;
    const mouseY = e.clientY - panOffset.y;
    const rectX = parseFloat(draggedElement.style.left);
    const rectY = parseFloat(draggedElement.style.top);

    offset.x = mouseX - rectX;
    offset.y = mouseY - rectY;
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}
function onMouseMove(e) {
    if (!draggedElement) return;
    const mouseX = e.clientX - panOffset.x;
    const mouseY = e.clientY - panOffset.y;
    draggedElement.style.left = (mouseX - offset.x) + 'px';
    draggedElement.style.top = (mouseY - offset.y) + 'px';
    updatePortsPosition(draggedElement);
    updateLines();
}
function onMouseUp() {
    draggedElement = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
}

// --- ฟังก์ชันใหม่: หาจุดเชื่อมต่อที่ขอบกล่อง (แก้ปัญหาเส้นจม) ---
function getBestConnectionPoint(el, targetPoint) {
    const rect = getRect(el);
    const center = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    
    // คำนวณผลต่างระยะทาง
    const dx = targetPoint.x - center.x;
    const dy = targetPoint.y - center.y;
    
    // ดูว่าควรเข้าทางไหน (บน/ล่าง หรือ ซ้าย/ขวา)
    // โดยดูว่าระยะห่างแกนไหนมากกว่ากัน
    let side = '';
    let point = { x: 0, y: 0 };

    if (Math.abs(dy) > Math.abs(dx)) {
        // ระยะแนวตั้งมากกว่า -> เข้าทาง บน หรือ ล่าง
        if (dy > 0) {
            side = 'bottom';
            point = { x: center.x, y: rect.bottom };
        } else {
            side = 'top';
            point = { x: center.x, y: rect.top };
        }
    } else {
        // ระยะแนวนอนมากกว่า -> เข้าทาง ซ้าย หรือ ขวา
        if (dx > 0) {
            side = 'right';
            point = { x: rect.right, y: center.y };
        } else {
            side = 'left';
            point = { x: rect.left, y: center.y };
        }
    }
    return { point, side };
}

// --- Logic ---
function updateLines() {
    const autoConnections = [];
    const lineGap = 6; // ระยะห่างจากขอบกล่อง (เพิ่มขึ้นนิดนึงให้สวย)

    connections.forEach(conn => {
        const el1 = document.getElementById(conn.from);
        const el2 = document.getElementById(conn.to);
        if (!el1 || !el2) return;

        let p1 = null, p2 = null, side1 = null, side2 = null;
        
        // 1. ตรวจสอบว่ามีการล็อกจุด (Manual Port) หรือไม่
        if (conn.fromPortIndex !== null) {
            const res = getPortInfo(el1, conn.fromPortIndex);
            if(res) { p1 = res.pos; side1 = res.side; }
        }
        if (conn.toPortIndex !== null) {
            const res = getPortInfo(el2, conn.toPortIndex);
            if(res) { p2 = res.pos; side2 = res.side; }
        }

        // 2. ถ้าฝั่งไหนไม่ได้ล็อก (เป็น Auto) ให้คำนวณหา "ขอบ" ที่ดีที่สุด
        // กรณี: ต้นทาง Auto (คำนวณเทียบกับปลายทาง)
        if (!p1) {
            const refPoint = p2 || getCenter(el2); // ใช้จุดปลายทางเป็นตัวอ้างอิง
            const best = getBestConnectionPoint(el1, refPoint); // หาขอบที่ดีที่สุด
            p1 = best.point;
            side1 = best.side;
        }

        // กรณี: ปลายทาง Auto (คำนวณเทียบกับต้นทาง) << จุดที่แก้บัคเส้นจม
        if (!p2) {
            const refPoint = p1; // ใช้จุดต้นทางเป็นตัวอ้างอิง
            const best = getBestConnectionPoint(el2, refPoint); // หาขอบที่ดีที่สุด
            p2 = best.point;
            side2 = best.side;
        }

        // 3. ดันจุดออกจากขอบเล็กน้อย (Apply Gap) เพื่อไม่ให้หัวลูกศรเกยเส้นขอบ
        const drawP1 = applyOffset(p1, side1, lineGap);
        const drawP2 = applyOffset(p2, side2, lineGap);

        // 4. วาดเส้น
        const d = getRoundedOrthogonalPath(drawP1, drawP2, side1);
        conn.pathElement.setAttribute('d', d);
        
        conn.startSide = side1; 
        conn.endSide = side2; 
        updateHandlePos(conn, drawP1, drawP2);
    });
}

// --- ฟังก์ชันใหม่: ช่วยดันจุดตามทิศทาง ---
function applyOffset(p, side, amount) {
    if(!p) return p;
    const newP = { x: p.x, y: p.y };
    if (side === 'top') newP.y -= amount;
    else if (side === 'bottom') newP.y += amount;
    else if (side === 'left') newP.x -= amount;
    else if (side === 'right') newP.x += amount;
    return newP;
}

function getRect(el) {
    return {
        left: parseFloat(el.style.left),
        top: parseFloat(el.style.top),
        width: el.offsetWidth,
        height: el.offsetHeight,
        right: parseFloat(el.style.left) + el.offsetWidth,
        bottom: parseFloat(el.style.top) + el.offsetHeight
    };
}

function updateHandlePos(conn, p1, p2) {
    if(conn.startHandle) { conn.startHandle.setAttribute('cx', p1.x); conn.startHandle.setAttribute('cy', p1.y); }
    if(conn.endHandle) { conn.endHandle.setAttribute('cx', p2.x); conn.endHandle.setAttribute('cy', p2.y); }
    updateLabelPositions(conn, p1, p2);
}

function updateLabelPositions(conn, p1, p2) {
    // เพิ่มระยะห่างเป็น 35px (จากเดิม 25) 
    // + ระยะ lineGap ที่เพิ่มมาตะกี้อีก 4px รวมเป็นเกือบ 40px
    const offset = 35; 
    setPosition(conn.startLabel, p1, conn.startSide, offset);
    setPosition(conn.endLabel, p2, conn.endSide, offset);
}

function setPosition(labelElement, point, side, dist) {
    if(!labelElement) return;
    let x = point.x;
    let y = point.y;

    // คำนวณตำแหน่งตัวเลขแบบแม่นยำขึ้น
    if (side === 'top') {
        y -= dist; 
    } else if (side === 'bottom') {
        y += dist; 
    } else if (side === 'left') {
        x -= dist; 
    } else if (side === 'right') {
        x += dist; 
    } else {
        // กรณีมุมเฉียง หรือหา side ไม่เจอ
        x += 20; y -= 20; 
    }

    labelElement.setAttribute('x', x);
    labelElement.setAttribute('y', y);
}

function updateSingleLineManual(conn, mx, my, isStart) {
    const elOther = document.getElementById(isStart ? conn.to : conn.from);
    const pOther = getCenter(elOther);
    let d;
    if(isStart) d = getRoundedOrthogonalPath({x:mx, y:my}, pOther, 'bottom'); 
    else d = getRoundedOrthogonalPath(pOther, {x:mx, y:my}, 'bottom');
    conn.pathElement.setAttribute('d', d);
}

function getPortInfo(el, index) {
    const port = el.querySelector(`.snap-port[data-port-index="${index}"]`);
    if(!port) return null;
    const classRect = getRect(el);
    const portLeft = parseFloat(port.style.left);
    const portTop = parseFloat(port.style.top);
    
    return { 
        pos: { x: classRect.left + portLeft, y: classRect.top + portTop }, 
        side: port.dataset.side 
    };
}

function determineSides(el1, el2) {
    const c1 = getCenter(el1); const c2 = getCenter(el2);
    const dx = c2.x - c1.x; const dy = c2.y - c1.y;
    if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
    else return dx > 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
}
function sortConnectionsByPosition(side, sideConns) {
    sideConns.sort((a, b) => {
        const cA = getCenter(a.otherEl); const cB = getCenter(b.otherEl);
        if (side === 'top' || side === 'bottom') return cA.x - cB.x; else return cA.y - cB.y;
    });
}
function getRoundedOrthogonalPath(p1, p2, startSide) {
    if(!p1 || !p2) return "";
    const s1 = p1; const s2 = p2;
    const radius = 10;
    if (Math.abs(s1.x - s2.x) < 5 || Math.abs(s1.y - s2.y) < 5) return `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y}`;
    let d = `M ${s1.x} ${s1.y}`;
    const midY = (s1.y + s2.y) / 2; const midX = (s1.x + s2.x) / 2;
    if (startSide === 'top' || startSide === 'bottom' || startSide === 'vertical') {
        d += ` L ${s1.x} ${midY - (midY>s1.y?radius:-radius)} Q ${s1.x} ${midY} ${s1.x+(s2.x>s1.x?radius:-radius)} ${midY}`;
        d += ` L ${s2.x - (s2.x>s1.x?radius:-radius)} ${midY} Q ${s2.x} ${midY} ${s2.x} ${midY+(s2.y>midY?radius:-radius)} L ${s2.x} ${s2.y}`;
    } else {
        d += ` L ${midX - (midX>s1.x?radius:-radius)} ${s1.y} Q ${midX} ${s1.y} ${midX} ${s1.y+(s2.y>s1.y?radius:-radius)}`;
        d += ` L ${midX} ${s2.y - (s2.y>s1.y?radius:-radius)} Q ${midX} ${s2.y} ${midX+(s2.x>midX?radius:-radius)} ${s2.y} L ${s2.x} ${s2.y}`;
    }
    return d;
}
function getCenter(el) {
    const r = getRect(el);
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
}

function enableEdit(el) {
    if(mode === 'delete') return;
    el.contentEditable = "true"; 
    el.focus();
    
    // แก้ตรงนี้: ใช้ requestAnimationFrame ช่วยให้ลื่นขึ้นและตำแหน่งแม่นยำ
    el.oninput = () => {
        requestAnimationFrame(() => {
            updatePortsPosition(el.closest('.uml-class'));
            updateLines();
        });
    };

    // ... (ส่วน onpaste และ onblur เหมือนเดิม ไม่ต้องแก้) ...
    el.onpaste = (e) => {
        e.preventDefault();
        const text = (e.originalEvent || e).clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    el.onblur = () => { 
        el.contentEditable = "false"; 
        if (el.innerText.trim() === "") el.remove();
        
        const classEl = el.closest('.uml-class');
        if(classEl) {
            // อัปเดตทิ้งท้ายอีกรอบตอนพิมพ์เสร็จ
            updatePortsPosition(classEl);
            updateLines(); 
        }
    };
}

function clearAll() {
    if(confirm("ลบทั้งหมด?")) {
        document.querySelectorAll('.uml-class').forEach(e => e.remove());
        document.querySelectorAll('path.connection').forEach(e => e.remove());
        document.querySelectorAll('.conn-handle').forEach(e => e.remove());
        document.querySelectorAll('.label-text').forEach(e => e.remove());
        connections = []; classCounter = 0;
        
        panOffset = { x: 0, y: 0 };
        applyPan();
    }
}

// Initial Class
addClass();