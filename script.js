let mode = 'move'; 
let currentType = 'association';
let selectedSource = null;
let draggedElement = null;
let connections = [];
let offset = { x: 0, y: 0 };
let classCounter = 0;
let rightClickedClassId = null;

let draggedHandle = null; 
let currentHoverClass = null; 

let isPanning = false;
let startPan = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 }; 

// Performance Limiter
let isFramePending = false; 

const canvas = document.getElementById('canvas');
const svgLayer = document.getElementById('svg-layer');
const statusMsg = document.getElementById('status-msg');
const contextMenu = document.getElementById('context-menu');
const helpModal = document.getElementById('help-modal');
const floatInput = document.getElementById('floating-input');
let editingLabel = null; 

// --- Helper: Toggle Modal ---
function toggleHelp() { helpModal.style.display = (helpModal.style.display === "block") ? "none" : "block"; }
window.onclick = function(event) { if (event.target == helpModal) helpModal.style.display = "none"; }

// --- Panning Logic (หัวใจสำคัญ: ต้องขยับทั้ง SVG และ Class) ---
window.addEventListener('mousedown', (e) => {
    // คลิกขวาที่ว่างเพื่อ Pan
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
    isPanning = false; 
    document.body.classList.remove('panning');
});

// ฟังก์ชันขยับจอ (แก้บัคเส้นหลุดที่นี่)
function applyPan() {
    // 1. ขยับเลเยอร์เส้น (สำคัญมาก! ถ้าไม่มีบรรทัดนี้ เส้นจะอยู่ที่เดิม)
    svgLayer.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
    
    // 2. ขยับลายพื้นหลัง
    canvas.style.backgroundPosition = `${panOffset.x}px ${panOffset.y}px`;
    
    // 3. ขยับกล่อง Class ทุกกล่อง
    document.querySelectorAll('.uml-class').forEach(el => {
        el.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
    });
    
    hideFloatInput();
}

// --- Class Functions ---
function addClass() {
    classCounter++;
    const div = document.createElement('div');
    div.className = 'uml-class';
    div.id = 'class-' + classCounter;
    
    // คำนวณตำแหน่งกลางจอ (ต้องหักลบ Pan ออกเพื่อให้วางตรงกลาง Viewport จริงๆ)
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const centerX = (-panOffset.x + viewW / 2) - 90;
    const centerY = (-panOffset.y + viewH / 2) - 50;
    
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
    
    // Highlight Effect
    div.addEventListener('mouseenter', () => { if(draggedHandle) { div.classList.add('hover-target'); currentHoverClass = div; } });
    div.addEventListener('mouseleave', () => { div.classList.remove('hover-target'); if(currentHoverClass === div) currentHoverClass = null; });

    canvas.appendChild(div);
    
    // สำคัญ: สั่งให้กล่องใหม่รู้จักค่า Pan ปัจจุบันทันที
    applyPan(); 

    if(mode !== 'delete') setMode('move');
}

// Placeholder functions (Compatibility)
function initPorts(classEl) {} 
function updatePortsPosition(classEl) {}

// --- Menu Functions ---
function onRightClick(e) {
    e.preventDefault(); if(isPanning) return; 
    rightClickedClassId = e.currentTarget.id;
    contextMenu.style.display = 'block';
    // เมนูต้องไม่ขยับตาม Pan (ใช้ clientX/Y หรือหักลบให้ถูก)
    // แต่วิธีง่ายคือวางตามเมาส์หน้าจอ
    contextMenu.style.left = e.pageX + 'px'; 
    contextMenu.style.top = e.pageY + 'px';
}
document.addEventListener('click', e => { if (e.button !== 2) contextMenu.style.display = 'none'; });

function triggerAddAttribute() { addClassItem('.uml-attributes', '- attribute'); }
function triggerAddMethod() { addClassItem('.uml-methods', '+ method()'); }

function addClassItem(selector, text) {
    if (!rightClickedClassId) return;
    const classEl = document.getElementById(rightClickedClassId);
    const container = classEl.querySelector(selector);
    const item = document.createElement('div');
    item.className = 'uml-item'; item.innerText = text;
    item.setAttribute('ondblclick', 'enableEdit(this)');
    container.appendChild(item);
    enableEdit(item); 
    scheduleUpdate();
}

function triggerDeleteClass() { 
    if(rightClickedClassId) { deleteClass(rightClickedClassId); rightClickedClassId = null; }
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
        canvas.style.cursor = 'default';
    } else if (mode === 'delete') {
        document.getElementById('btn-delete-mode').classList.add('active');
        document.body.classList.add('mode-delete');
    } else {
        document.getElementById('btn-' + currentType).classList.add('active');
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
    scheduleUpdate();
}

// --- Create Lines ---
function createLine(sourceId, targetId, type) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection');
    if (type === 'inheritance') path.setAttribute('marker-end', 'url(#marker-inheritance)');
    else if (type === 'aggregation') path.setAttribute('marker-start', 'url(#marker-aggregation)');
    else if (type === 'composition') path.setAttribute('marker-start', 'url(#marker-composition)');
    
    const startHandle = createHandle('start');
    const endHandle = createHandle('end');
    const startLabel = createLabel("1");
    const endLabel = createLabel("1");

    const connObj = { 
        from: sourceId, to: targetId, pathElement: path, type: type,
        startHandle: startHandle, endHandle: endHandle,
        startLabel: startLabel, endLabel: endLabel
    };
    
    setupHandleDrag(startHandle, connObj, true);
    setupHandleDrag(endHandle, connObj, false);

    path.addEventListener('click', (e) => {
        if (mode === 'delete') { e.stopPropagation(); deleteConnection(connObj); }
    });

    svgLayer.appendChild(path);
    svgLayer.appendChild(startHandle);
    svgLayer.appendChild(endHandle);
    svgLayer.appendChild(startLabel);
    svgLayer.appendChild(endLabel);
    
    connections.push(connObj);
    scheduleUpdate();
}

function createHandle(type) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', 'conn-handle ' + type);
    return c;
}

function createLabel(text) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('class', 'label-text');
    t.textContent = text;
    t.addEventListener('mousedown', (e) => e.stopPropagation());
    t.addEventListener('click', (e) => e.stopPropagation());
    t.addEventListener('dblclick', (e) => {
        e.stopPropagation(); e.preventDefault(); showFloatInput(e, t);
    });
    return t;
}

function showFloatInput(e, labelEl) {
    editingLabel = labelEl;
    floatInput.value = labelEl.textContent;
    floatInput.style.display = 'block';
    // แสดง Input ตรงตำแหน่งเมาส์ (ไม่ต้องหัก Pan เพราะ Input เป็น position:absolute ทับหน้าจอ)
    floatInput.style.left = e.clientX + 'px';
    floatInput.style.top = e.clientY + 'px';
    setTimeout(() => { floatInput.classList.add('active'); floatInput.focus(); floatInput.select(); }, 10);
}
function hideFloatInput() {
    floatInput.classList.remove('active');
    setTimeout(() => { if(!floatInput.classList.contains('active')) floatInput.style.display = 'none'; }, 100);
    editingLabel = null;
}
function saveFloatInput() {
    if (editingLabel && floatInput.style.display !== 'none') {
        const val = floatInput.value.trim();
        if(val !== "") editingLabel.textContent = val;
        hideFloatInput();
    }
}
floatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveFloatInput(); else if (e.key === 'Escape') hideFloatInput(); });
floatInput.addEventListener('blur', saveFloatInput);

function deleteConnection(conn, skipArrayFilter = false) {
    svgLayer.removeChild(conn.pathElement);
    svgLayer.removeChild(conn.startHandle);
    svgLayer.removeChild(conn.endHandle);
    if(conn.startLabel) svgLayer.removeChild(conn.startLabel);
    if(conn.endLabel) svgLayer.removeChild(conn.endLabel);
    if(!skipArrayFilter) {
        connections = connections.filter(c => c !== conn);
        scheduleUpdate();
    }
}

// --- Dragging Handle ---
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
    
    // แปลงพิกัดเมาส์ (Screen) ให้เป็นพิกัดตรรกะ (Logical) โดยการหักค่า Pan ออก
    const mx = e.clientX - panOffset.x;
    const my = e.clientY - panOffset.y;
    
    let drawX = mx, drawY = my;

    if(currentHoverClass) {
        // Snap เข้าหาขอบ
        const rect = getRect(currentHoverClass);
        const closest = getClosestPointOnRectBorder(rect, mx, my);
        drawX = closest.x; drawY = closest.y;
    }
    
    // ตั้งค่าตำแหน่ง Handle (ใน SVG ที่ถูก Transform แล้ว)
    draggedHandle.handle.setAttribute('cx', drawX);
    draggedHandle.handle.setAttribute('cy', drawY);
    
    updateSingleLineManual(draggedHandle.conn, drawX, drawY, draggedHandle.isStart);
}

function onHandleMouseUp(e) {
    if(!draggedHandle) return;
    document.body.classList.remove('dragging-handle');
    if(currentHoverClass) {
        if(draggedHandle.isStart) draggedHandle.conn.from = currentHoverClass.id;
        else draggedHandle.conn.to = currentHoverClass.id;
        currentHoverClass.classList.remove('hover-target');
        currentHoverClass = null;
    }
    draggedHandle = null;
    window.removeEventListener('mousemove', onHandleMouseMove);
    window.removeEventListener('mouseup', onHandleMouseUp);
    scheduleUpdate();
}

// --- Dragging Class ---
function onMouseDown(e) {
    if (e.target.isContentEditable || mode !== 'move' || e.button === 2) return; 
    draggedElement = e.currentTarget;
    document.querySelectorAll('.uml-class').forEach(el => el.style.zIndex = 10);
    draggedElement.style.zIndex = 100;
    
    // คำนวณเมาส์แบบ Logical
    const mouseX = e.clientX - panOffset.x; 
    const mouseY = e.clientY - panOffset.y;
    
    // อ่านค่า Left/Top (เป็น Logical อยู่แล้ว)
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
    
    scheduleUpdate();
}

function onMouseUp() {
    draggedElement = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
}

// --- Performance Updater ---
function scheduleUpdate() {
    if (!isFramePending) {
        isFramePending = true;
        requestAnimationFrame(() => {
            updateLines();
            isFramePending = false;
        });
    }
}

// --- Main Line Logic ---
function updateLines() {
    const classConnections = {}; 
    const ensureClassEntry = (id) => {
        if(!classConnections[id]) classConnections[id] = { top: [], right: [], bottom: [], left: [] };
    };

    connections.forEach(conn => {
        const el1 = document.getElementById(conn.from);
        const el2 = document.getElementById(conn.to);
        if(!el1 || !el2) return;

        ensureClassEntry(conn.from); ensureClassEntry(conn.to);
        const sides = determineSides(el1, el2);
        
        classConnections[conn.from][sides.from].push({ conn, isStart: true, otherEl: el2 });
        classConnections[conn.to][sides.to].push({ conn, isStart: false, otherEl: el1 });
    });

    Object.keys(classConnections).forEach(classId => {
        const sides = classConnections[classId];
        const el = document.getElementById(classId);
        if(!el) return;
        const rect = getRect(el);

        ['top', 'right', 'bottom', 'left'].forEach(side => {
            const list = sides[side];
            if(list.length === 0) return;

            list.sort((a, b) => {
                const cA = getCenter(a.otherEl); const cB = getCenter(b.otherEl);
                if(side === 'top' || side === 'bottom') return cA.x - cB.x;
                return cA.y - cB.y;
            });

            const step = (side === 'top' || side === 'bottom') ? rect.width / (list.length + 1) : rect.height / (list.length + 1);
            
            list.forEach((item, index) => {
                const offset = (index + 1) * step;
                let p = { x: 0, y: 0 };
                if(side === 'top') { p.x = rect.left + offset; p.y = rect.top; }
                else if(side === 'bottom') { p.x = rect.left + offset; p.y = rect.bottom; }
                else if(side === 'left') { p.x = rect.left; p.y = rect.top + offset; }
                else if(side === 'right') { p.x = rect.right; p.y = rect.top + offset; }

                const gap = 6;
                const drawP = applyOffset(p, side, gap);

                if(item.isStart) { item.conn.p1 = drawP; item.conn.side1 = side; } 
                else { item.conn.p2 = drawP; item.conn.side2 = side; }
            });
        });
    });

    const allRects = Array.from(document.querySelectorAll('.uml-class')).map(el => ({
        id: el.id, ...getRect(el)
    }));

    connections.forEach(conn => {
        if(conn.p1 && conn.p2) {
            const d = getSmartPath(conn.p1, conn.p2, conn.side1, conn.side2, allRects, conn.from, conn.to);
            conn.pathElement.setAttribute('d', d);
            updateHandlePos(conn, conn.p1, conn.p2);
            
            const labelOffset = 35;
            setPosition(conn.startLabel, conn.p1, conn.side1, labelOffset);
            setPosition(conn.endLabel, conn.p2, conn.side2, labelOffset);
        }
    });
}

function getSmartPath(p1, p2, side1, side2, obstacles, id1, id2) {
    let s1 = {x: p1.x, y: p1.y};
    let s2 = {x: p2.x, y: p2.y};
    let midX = (s1.x + s2.x) / 2;
    let midY = (s1.y + s2.y) / 2;
    const radius = 10;

    const blockers = obstacles.filter(r => r.id !== id1 && r.id !== id2);
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);

    if (side1 === 'top' || side1 === 'bottom') {
        blockers.forEach(rect => {
            if (rect.bottom > minY && rect.top < maxY) {
                if (rect.left < maxX && rect.right > minX) {
                     const centerRect = (rect.left + rect.right)/2;
                     const centerLine = (p1.x + p2.x)/2;
                     if (centerRect < centerLine) midX = Math.max(midX, rect.right + 30);
                     else midX = Math.min(midX, rect.left - 30);
                }
            }
        });
        
        let d = `M ${s1.x} ${s1.y}`;
        const midY1 = (p1.y + p2.y) / 2;
        d += ` L ${p1.x} ${midY1}`; 
        d += ` Q ${p1.x} ${midY1+ (p1.y<midY1?radius:-radius)} ${p1.x < midX ? p1.x+radius : p1.x-radius} ${midY1}`; 
        d += ` L ${midX} ${midY1}`; 
        
        if (Math.abs(midX - (p1.x+p2.x)/2) > 50) {
             const yExit = (side1 === 'bottom') ? p1.y + 20 : p1.y - 20;
             const yEnter = (side2 === 'bottom') ? p2.y + 20 : p2.y - 20;
             return `M ${p1.x} ${p1.y} L ${p1.x} ${yExit} L ${midX} ${yExit} L ${midX} ${yEnter} L ${p2.x} ${yEnter} L ${p2.x} ${p2.y}`;
        }
    } else {
        blockers.forEach(rect => {
             if (rect.right > minX && rect.left < maxX) {
                 if (rect.top < maxY && rect.bottom > minY) {
                     const centerRect = (rect.top + rect.bottom)/2;
                     const centerLine = (p1.y + p2.y)/2;
                     if (centerRect < centerLine) midY = Math.max(midY, rect.bottom + 30);
                     else midY = Math.min(midY, rect.top - 30);
                 }
             }
        });
        
        if (Math.abs(midY - (p1.y+p2.y)/2) > 50) {
             const xExit = (side1 === 'right') ? p1.x + 20 : p1.x - 20;
             const xEnter = (side2 === 'right') ? p2.x + 20 : p2.x - 20;
             return `M ${p1.x} ${p1.y} L ${xExit} ${p1.y} L ${xExit} ${midY} L ${xEnter} ${midY} L ${xEnter} ${p2.y} L ${p2.x} ${p2.y}`;
        }
    }
    return getRoundedOrthogonalPath(p1, p2, side1);
}

// --- Utils ---
function getRect(el) {
    return {
        left: parseFloat(el.style.left), top: parseFloat(el.style.top),
        width: el.offsetWidth, height: el.offsetHeight,
        right: parseFloat(el.style.left) + el.offsetWidth,
        bottom: parseFloat(el.style.top) + el.offsetHeight
    };
}
function getCenter(el) { const r = getRect(el); return { x: r.left + r.width/2, y: r.top + r.height/2 }; }
function getClosestPointOnRectBorder(rect, x, y) {
    const cx = Math.max(rect.left, Math.min(x, rect.right));
    const cy = Math.max(rect.top, Math.min(y, rect.bottom));
    const dl = Math.abs(x - rect.left), dr = Math.abs(x - rect.right), dt = Math.abs(y - rect.top), db = Math.abs(y - rect.bottom);
    const min = Math.min(dl, dr, dt, db);
    if(min === dt) return { x: cx, y: rect.top }; if(min === db) return { x: cx, y: rect.bottom };
    if(min === dl) return { x: rect.left, y: cy }; return { x: rect.right, y: cy };
}
function applyOffset(p, side, amount) {
    if(!p) return p; const newP = { x: p.x, y: p.y };
    if (side === 'top') newP.y -= amount; else if (side === 'bottom') newP.y += amount;
    else if (side === 'left') newP.x -= amount; else if (side === 'right') newP.x += amount;
    return newP;
}
function updateHandlePos(conn, p1, p2) {
    if(conn.startHandle) { conn.startHandle.setAttribute('cx', p1.x); conn.startHandle.setAttribute('cy', p1.y); }
    if(conn.endHandle) { conn.endHandle.setAttribute('cx', p2.x); conn.endHandle.setAttribute('cy', p2.y); }
}
function setPosition(labelElement, point, side, dist) {
    if(!labelElement) return; let x = point.x; let y = point.y;
    if (side === 'top') y -= dist; else if (side === 'bottom') y += dist;
    else if (side === 'left') x -= dist; else if (side === 'right') x += dist;
    labelElement.setAttribute('x', x); labelElement.setAttribute('y', y);
}
function updateSingleLineManual(conn, mx, my, isStart) {
    const elOther = document.getElementById(isStart ? conn.to : conn.from);
    const pOther = getCenter(elOther);
    const d = `M ${isStart?mx:pOther.x} ${isStart?my:pOther.y} L ${isStart?pOther.x:mx} ${isStart?pOther.y:my}`;
    conn.pathElement.setAttribute('d', d);
}
function determineSides(el1, el2) {
    const c1 = getCenter(el1); const c2 = getCenter(el2);
    const dx = c2.x - c1.x; const dy = c2.y - c1.y;
    if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
    else return dx > 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
}
function getRoundedOrthogonalPath(p1, p2, startSide) {
    if(!p1 || !p2) return "";
    const s1 = p1; const s2 = p2; const radius = 10;
    if (Math.abs(s1.x - s2.x) < 5 || Math.abs(s1.y - s2.y) < 5) return `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y}`;
    let d = `M ${s1.x} ${s1.y}`;
    const midY = (s1.y + s2.y) / 2; const midX = (s1.x + s2.x) / 2;
    if (startSide === 'top' || startSide === 'bottom') {
        d += ` L ${s1.x} ${midY - (midY>s1.y?radius:-radius)} Q ${s1.x} ${midY} ${s1.x+(s2.x>s1.x?radius:-radius)} ${midY}`;
        d += ` L ${s2.x - (s2.x>s1.x?radius:-radius)} ${midY} Q ${s2.x} ${midY} ${s2.x} ${midY+(s2.y>midY?radius:-radius)} L ${s2.x} ${s2.y}`;
    } else {
        d += ` L ${midX - (midX>s1.x?radius:-radius)} ${s1.y} Q ${midX} ${s1.y} ${midX} ${s1.y+(s2.y>s1.y?radius:-radius)}`;
        d += ` L ${midX} ${s2.y - (s2.y>s1.y?radius:-radius)} Q ${midX} ${s2.y} ${midX+(s2.x>midX?radius:-radius)} ${s2.y} L ${s2.x} ${s2.y}`;
    }
    return d;
}
function clearAll() {
    if(confirm("ลบทั้งหมด?")) {
        document.querySelectorAll('.uml-class').forEach(e => e.remove());
        document.querySelectorAll('path.connection').forEach(e => e.remove());
        document.querySelectorAll('.conn-handle').forEach(e => e.remove());
        document.querySelectorAll('.label-text').forEach(e => e.remove());
        connections = []; classCounter = 0; panOffset = { x: 0, y: 0 }; applyPan();
    }
}
function enableEdit(el) {
    if(mode === 'delete') return;
    el.contentEditable = "true"; el.focus();
    el.oninput = () => { scheduleUpdate(); };
    el.onpaste = (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.originalEvent || e).clipboardData.getData('text/plain')); };
    el.onblur = () => { el.contentEditable = "false"; if (el.innerText.trim() === "") el.remove(); scheduleUpdate(); };
}

// Initial Class
addClass();