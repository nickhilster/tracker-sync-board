(function () {
  const vscode = acquireVsCodeApi();

  const lanes = [
    { id: 'todo', title: 'To Do' },
    { id: 'progress', title: 'In Progress' },
    { id: 'done', title: 'Done' }
  ];

  let state = {
    revision: 1,
    updatedAt: new Date().toISOString(),
    tasks: [],
    messages: []
  };

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function text(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function statusClass(task) {
    return task.status || task.lane || 'todo';
  }

  function groupedMilestones(tasks) {
    const groups = new Map();
    for (const task of tasks) {
      const key = task.milestone || 'Unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function nextLane(current) {
    if (current === 'todo') return 'progress';
    if (current === 'progress') return 'done';
    return 'done';
  }

  function renderStats() {
    const counts = state.tasks.reduce((acc, t) => {
      if (t.status === 'blocked') acc.blocked += 1;
      else if (t.lane === 'done') acc.done += 1;
      else if (t.lane === 'progress') acc.progress += 1;
      else acc.todo += 1;
      return acc;
    }, { done: 0, progress: 0, todo: 0, blocked: 0 });

    const openMessages = state.messages.filter(m => !m.resolved).length;

    document.getElementById('countDone').textContent = counts.done;
    document.getElementById('countProgress').textContent = counts.progress;
    document.getElementById('countTodo').textContent = counts.todo;
    document.getElementById('countBlocked').textContent = counts.blocked;
    document.getElementById('countMessages').textContent = openMessages;
    document.getElementById('updatedAt').textContent = new Date(state.updatedAt).toLocaleString();
  }

  function renderMilestones() {
    const root = document.getElementById('milestones');
    root.innerHTML = '';

    const entries = groupedMilestones(state.tasks);
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'small';
      empty.textContent = 'No milestones yet. Add tasks with milestone names to track progress.';
      root.appendChild(empty);
      return;
    }

    for (const [name, tasks] of entries) {
      const total = tasks.length;
      const done = tasks.filter(t => t.lane === 'done').length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);

      const item = document.createElement('article');
      item.className = 'milestone';
      item.innerHTML = `
        <div class="hdr">
          <strong>${name}</strong>
          <span>${done}/${total} (${pct}%)</span>
        </div>
        <div class="bar">
          <div class="fill" style="width:${pct}%"></div>
        </div>
      `;
      root.appendChild(item);
    }
  }

  function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    for (const lane of lanes) {
      const laneEl = document.createElement('section');
      laneEl.className = 'lane';
      laneEl.innerHTML = `<h3>${lane.title}</h3>`;

      for (const owner of ['human', 'ai']) {
        const swim = document.createElement('div');
        swim.className = 'swim';
        swim.innerHTML = `<h4><span class="dot ${owner}"></span>${owner === 'human' ? 'Human' : 'AI'}</h4>`;

        const entries = state.tasks.filter(t => t.lane === lane.id && t.owner === owner);
        if (entries.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'small';
          empty.textContent = 'No tasks';
          swim.appendChild(empty);
        }

        entries.forEach(task => {
          const card = document.createElement('article');
          card.className = 'task';
          card.innerHTML = `
            <div class="title">${task.title}</div>
            <div class="chips">
              <span class="chip ${statusClass(task)}">${task.status}</span>
              <span class="chip ${task.owner}">${task.owner}</span>
              <span class="chip ${task.priority || 'p1'}">${(task.priority || 'p1').toUpperCase()}</span>
              <span class="chip effort">${task.effort || 'n/a'}</span>
            </div>
            <div class="note">${task.milestone || 'No milestone'}</div>
            <div class="note">${task.note || ''}</div>
            <div class="row">
              <button data-act="advance" data-id="${task.id}">Advance</button>
              <button data-act="owner" data-id="${task.id}">Swap Owner</button>
              <button data-act="block" data-id="${task.id}">Toggle Block</button>
              <button data-act="del" data-id="${task.id}">Delete</button>
            </div>
          `;
          swim.appendChild(card);
        });

        laneEl.appendChild(swim);
      }

      board.appendChild(laneEl);
    }
  }

  function renderMessages() {
    const list = document.getElementById('messages');
    list.innerHTML = '';

    const messages = [...state.messages].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
    if (messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'small';
      empty.textContent = 'No messages yet';
      list.appendChild(empty);
      return;
    }

    for (const m of messages) {
      const node = document.createElement('article');
      node.className = 'msg';
      node.innerHTML = `
        <div class="hdr">
          <span>${m.from} -> ${m.to} | ${m.type}</span>
          <span>${new Date(m.createdAt).toLocaleString()}</span>
        </div>
        <div><strong>${m.title}</strong></div>
        <div class="body">${m.body}</div>
        <div class="row">
          <button data-msg-act="resolve" data-id="${m.id}">${m.resolved ? 'Reopen' : 'Resolve'}</button>
          <button data-msg-act="del" data-id="${m.id}">Delete</button>
        </div>
      `;
      list.appendChild(node);
    }
  }

  function render() {
    renderStats();
    renderMilestones();
    renderBoard();
    renderMessages();
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    state.revision = (state.revision || 0) + 1;
    vscode.postMessage({ type: 'saveState', payload: state });
  }

  function wire() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'requestState' });
    });

    document.getElementById('saveBtn').addEventListener('click', saveState);

    document.getElementById('seedBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'seedRoadmap' });
    });

    document.getElementById('openFileBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openStateFile' });
    });

    document.getElementById('processBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'processHumanMessages' });
    });

    document.getElementById('addTaskBtn').addEventListener('click', () => {
      const title = text('taskTitle');
      if (!title) return;

      const lane = document.getElementById('taskLane').value;

      state.tasks.push({
        id: uid('task'),
        title,
        note: text('taskNote'),
        owner: document.getElementById('taskOwner').value,
        lane,
        status: lane === 'done' ? 'done' : 'todo',
        effort: text('taskEffort'),
        milestone: text('taskMilestone'),
        priority: document.getElementById('taskPriority').value,
        createdAt: new Date().toISOString()
      });

      setText('taskTitle', '');
      setText('taskNote', '');
      setText('taskMilestone', '');
      setText('taskEffort', '');

      saveState();
    });

    document.getElementById('sendMsgBtn').addEventListener('click', () => {
      const title = text('msgTitle');
      const body = text('msgBody');
      if (!title || !body) return;

      state.messages.push({
        id: uid('msg'),
        from: 'human',
        to: 'ai',
        type: document.getElementById('msgType').value,
        title,
        body,
        createdAt: new Date().toISOString(),
        resolved: false
      });

      setText('msgTitle', '');
      setText('msgBody', '');

      saveState();
    });

    document.body.addEventListener('click', (evt) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;

      const id = target.dataset.id;
      if (!id) return;

      const action = target.dataset.act;
      if (action) {
        const task = state.tasks.find(t => t.id === id);
        if (!task) return;

        if (action === 'advance') {
          task.lane = nextLane(task.lane);
          task.status = task.lane === 'done' ? 'done' : 'progress';
        }
        if (action === 'owner') {
          task.owner = task.owner === 'human' ? 'ai' : 'human';
        }
        if (action === 'block') {
          task.status = task.status === 'blocked' ? (task.lane === 'done' ? 'done' : 'progress') : 'blocked';
        }
        if (action === 'del') {
          state.tasks = state.tasks.filter(t => t.id !== id);
        }

        saveState();
        return;
      }

      const msgAction = target.dataset.msgAct;
      if (msgAction) {
        const message = state.messages.find(m => m.id === id);
        if (!message) return;

        if (msgAction === 'resolve') message.resolved = !message.resolved;
        if (msgAction === 'del') state.messages = state.messages.filter(m => m.id !== id);

        saveState();
      }
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'state') {
        state = msg.payload;
        render();
      }

      if (msg.type === 'info' && msg.message) {
        const bar = document.getElementById('status');
        bar.textContent = msg.message;
      }
    });
  }

  wire();
  vscode.postMessage({ type: 'requestState' });
})();
