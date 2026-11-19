(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const VALID_OPS = ['MOV', 'ADD', 'SUB', 'MULT', 'DIV'];
  const INITIAL_REGS = { R1: 10, R2: 5, R3: 0 };

  const PRESET_PROGRAMS = {
    default: [
      'MOV R1, 10',
      'MOV R2, 20',
      'ADD R3, R1, R2',
      'SUB R2, R3, R1',
      'ADD R1, R2, R3',
    ].join('\n'),
    independent: [
      'MOV R1, 12',
      'MOV R2, 4',
      'MOV R3, 9',
      'ADD R1, R1, R1',
      'SUB R2, R2, R2',
    ].join('\n'),
    mixed: [
      'MOV R1, 8',
      'MOV R2, 2',
      'MULT R3, R1, R2',
      'DIV R1, R3, R2',
      'ADD R2, R1, R3',
    ].join('\n'),
  };

  let cpuCount = 0;
  let pipeState = null;
  let autoTimer = null;

  /* ---------------- Instruction Parser & Validator ---------------- */

  function isReg(token) {
    return /^R[1-3]$/.test(token || '');
  }

  function isNumericLiteral(token) {
    return /^-?\d+(\.\d+)?$/.test(token || '');
  }

  function parseInstruction(line) {
    const cleaned = (line || '').trim().toUpperCase();
    if (!cleaned) {
      throw new Error('Please enter an instruction (e.g., ADD R3, R1, R2).');
    }

    const normalizedSpacing = cleaned.replace(/,/g, ' ').trim();
    const parts = normalizedSpacing.split(/\s+/);
    const op = parts[0];
    const dest = parts[1];

    if (!VALID_OPS.includes(op)) {
      throw new Error(`Unknown operation "${op}". Supported: MOV, ADD, SUB, MULT, DIV.`);
    }

    if (!isReg(dest)) {
      throw new Error('Destination register must be R1, R2, or R3.');
    }

    if (op === 'MOV') {
      if (parts.length !== 3) {
        throw new Error('Invalid MOV syntax. Use: MOV R1, 20 (or MOV R1, R2).');
      }
      const operand = parts[2];
      if (isReg(operand)) {
        return {
          raw: `MOV ${dest}, ${operand}`,
          op,
          dest,
          src: [operand],
          imm: null,
          mode: 'reg',
        };
      }
      if (!isNumericLiteral(operand) || !Number.isFinite(Number(operand))) {
        throw new Error('MOV requires a valid numeric value or register (e.g., MOV R1, 20).');
      }
      const imm = Number(operand);
      return {
        raw: `MOV ${dest}, ${imm}`,
        op,
        dest,
        src: [],
        imm,
        mode: 'imm',
      };
    }

    if (parts.length !== 4 || !isReg(parts[2]) || !isReg(parts[3])) {
      throw new Error(`Invalid ${op} syntax. Use: ${op} R3, R1, R2.`);
    }

    return {
      raw: `${op} ${dest}, ${parts[2]}, ${parts[3]}`,
      op,
      dest,
      src: [parts[2], parts[3]],
      imm: null,
      mode: 'alu',
    };
  }

  function formatNumber(value) {
    if (Number.isInteger(value)) return value;
    return Number(value.toFixed(4));
  }

  function executeOnRegisters(inst, regs) {
    let val;
    let expr;

    if (inst.op === 'MOV') {
      if (inst.mode === 'reg') {
        val = regs[inst.src[0]];
        expr = `${inst.dest} ← ${inst.src[0]} (${val})`;
      } else {
        val = inst.imm;
        expr = `${inst.dest} ← ${val}`;
      }
    } else {
      const a = regs[inst.src[0]];
      const b = regs[inst.src[1]];
      if (inst.op === 'ADD') {
        val = a + b;
        expr = `${a} + ${b} = ${formatNumber(val)}`;
      } else if (inst.op === 'SUB') {
        val = a - b;
        expr = `${a} - ${b} = ${formatNumber(val)}`;
      } else if (inst.op === 'MULT') {
        val = a * b;
        expr = `${a} × ${b} = ${formatNumber(val)}`;
      } else if (inst.op === 'DIV') {
        if (b === 0) {
          throw new Error(`Cannot divide by zero (${inst.src[1]} = 0).`);
        }
        val = a / b;
        expr = `${a} ÷ ${b} = ${formatNumber(val)}`;
      }
    }

    if (!Number.isFinite(val)) {
      throw new Error('Arithmetic result is out of finite range.');
    }

    const formatted = formatNumber(val);
    regs[inst.dest] = formatted;
    return { value: formatted, expr };
  }

  /* ---------------- Navigation ---------------- */

  function switchPage(pageId) {
    document.querySelectorAll('.nav').forEach((btn) => {
      const active = btn.dataset.page === pageId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('.page').forEach((sec) => {
      sec.classList.toggle('active', sec.id === pageId);
    });

    if (pageId === 'doctor') {
      try {
        renderDiagnosis(parseProgram());
      } catch (err) {
        $('diagnosis').textContent = `Error: ${err.message}`;
      }
    }
  }

  document.querySelectorAll('.nav').forEach((btn) => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  $('brandLink').addEventListener('click', (e) => {
    e.preventDefault();
    switchPage('cpu');
  });

  /* ---------------- Phase 1: CPU Dashboard ---------------- */

  function readDashboardRegisters() {
    const regs = {};
    ['R1', 'R2', 'R3'].forEach((regName) => {
      const rawVal = $(regName.toLowerCase()).value.trim();
      if (rawVal === '' || !Number.isFinite(Number(rawVal))) {
        throw new Error(`Register ${regName} must contain a valid number.`);
      }
      regs[regName] = Number(rawVal);
    });
    return regs;
  }

  function setStatusTone(el, text, tone) {
    el.textContent = text;
    el.classList.remove('state-neutral', 'state-ok', 'state-err');
    el.classList.add(tone === 'ok' ? 'state-ok' : tone === 'err' ? 'state-err' : 'state-neutral');
  }

  function highlightRegisters(srcList, destReg) {
    ['R1', 'R2', 'R3'].forEach((reg) => {
      const row = $(`regRow${reg}`);
      const tag = $(`${reg.toLowerCase()}Tag`);
      row.classList.remove('reg-read', 'reg-write');
      if (reg === destReg) {
        row.classList.add('reg-write');
        tag.textContent = 'Written';
      } else if (srcList.includes(reg)) {
        row.classList.add('reg-read');
        tag.textContent = 'Read';
      }
    });
  }

  function appendMemoryLog(stepNum, instructionRaw, destReg, value) {
    const ul = $('memoryLog');
    const empty = ul.querySelector('.history-empty');
    if (empty) empty.remove();

    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = `#${stepNum}  ${instructionRaw}`;
    const right = document.createElement('strong');
    right.textContent = `${destReg} = ${value}`;
    li.appendChild(left);
    li.appendChild(right);
    ul.prepend(li);
  }

  function setResultBox(message, isError) {
    const box = $('result');
    box.textContent = message;
    box.classList.remove('output-ok', 'output-err');
    box.classList.add(isError ? 'output-err' : 'output-ok');
  }

  $('executeBtn').addEventListener('click', () => {
    try {
      const inst = parseInstruction($('instruction').value);
      const regs = readDashboardRegisters();
      const { value, expr } = executeOnRegisters(inst, regs);

      $(inst.dest.toLowerCase()).value = value;
      cpuCount += 1;
      $('instructionCount').textContent = cpuCount;

      setStatusTone($('cuStatus'), 'Instruction Completed', 'ok');
      $('cuDetail').textContent = `Decoded ${inst.raw} and routed control signals.`;
      $('sigOp').textContent = inst.op;
      $('sigDest').textContent = inst.dest;
      $('sigSrc').textContent = inst.src.length ? inst.src.join(', ') : String(inst.imm);

      setStatusTone($('aluStatus'), `${inst.op} Completed`, 'ok');
      $('aluDetail').textContent = `Result written to ${inst.dest}.`;
      $('aluExpr').textContent = expr;

      $('memoryStatus').textContent = `Recorded (${cpuCount})`;
      setStatusTone($('systemStatus'), 'Operating Normally', 'ok');

      highlightRegisters(inst.src, inst.dest);
      appendMemoryLog(cpuCount, inst.raw, inst.dest, value);
      setResultBox(`Success: ${inst.dest} = ${value} (${expr})`, false);
    } catch (err) {
      setStatusTone($('cuStatus'), 'Instruction Halted', 'err');
      $('cuDetail').textContent = err.message;
      setStatusTone($('aluStatus'), 'Waiting', 'neutral');
      setStatusTone($('systemStatus'), 'Input Needs Attention', 'err');
      setResultBox(`Error: ${err.message}`, true);
    }
  });

  $('instruction').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('executeBtn').click();
  });

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('instruction').value = btn.dataset.inst;
      $('instruction').focus();
    });
  });

  function resetCpuDashboard() {
    $('r1').value = INITIAL_REGS.R1;
    $('r2').value = INITIAL_REGS.R2;
    $('r3').value = INITIAL_REGS.R3;
    ['R1', 'R2', 'R3'].forEach((reg) => {
      $(`regRow${reg}`).classList.remove('reg-read', 'reg-write');
      $(`${reg.toLowerCase()}Tag`).textContent = 'Initial';
    });

    cpuCount = 0;
    $('instructionCount').textContent = '0';
    $('memoryStatus').textContent = 'Waiting';
    $('memoryLog').innerHTML = '<li class="history-empty">No instructions recorded yet.</li>';

    setStatusTone($('cuStatus'), 'Ready', 'neutral');
    $('cuDetail').textContent = 'Awaiting next instruction fetch and opcode decode.';
    $('sigOp').textContent = '—';
    $('sigDest').textContent = '—';
    $('sigSrc').textContent = '—';

    setStatusTone($('aluStatus'), 'Waiting', 'neutral');
    $('aluDetail').textContent = 'Performs MOV, ADD, SUB, MULT, and DIV operations.';
    $('aluExpr').textContent = 'Awaiting operands';

    setStatusTone($('systemStatus'), 'Ready', 'ok');
    $('instruction').value = '';
    const box = $('result');
    box.classList.remove('output-ok', 'output-err');
    box.textContent = 'CPU reset to initial state (R1 = 10, R2 = 5, R3 = 0).';
  }

  $('resetBtn').addEventListener('click', resetCpuDashboard);

  /* ---------------- Phase 2: Five-Stage In-Order Pipeline ---------------- */

  function parseProgram() {
    const lines = $('programInput')
      .value.split(/\n/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (!lines.length) {
      throw new Error('Enter at least one instruction in the program editor.');
    }
    if (lines.length > 20) {
      throw new Error('Program length is limited to 20 instructions for clear visualization.');
    }

    return lines.map((line, idx) => {
      try {
        return parseInstruction(line);
      } catch (err) {
        throw new Error(`Line ${idx + 1}: ${err.message}`);
      }
    });
  }

  /**
   * Simulates a collision-free 5-stage in-order pipeline (IF -> ID -> EX -> MEM -> WB).
   * - With forwarding enabled: ALU/MOV results bypass from EX/MEM or MEM/WB, so 0 RAW stalls.
   * - Without forwarding: Consumer waits in ID until producer reaches WB (split-cycle write/read: ID >= WB).
   * - In-order structural rule: IF_k = ID_{k-1} so no two instructions ever share a stage.
   */
  function simulatePipeline(list, forwardingEnabled) {
    const rows = [];

    list.forEach((ins, idx) => {
      const ifCycle = idx === 0 ? 1 : rows[idx - 1].stages.ID;
      let requiredId = ifCycle + 1;
      const forwardSources = [];

      ins.src.forEach((srcReg) => {
        for (let j = idx - 1; j >= 0; j -= 1) {
          if (rows[j].ins.dest === srcReg) {
            const producer = rows[j];
            if (!forwardingEnabled) {
              requiredId = Math.max(requiredId, producer.stages.WB);
            } else {
              const dist = idx - j;
              if (dist === 1) {
                forwardSources.push(`EX→EX (${srcReg} from I${j + 1})`);
              } else if (dist === 2) {
                forwardSources.push(`MEM→EX (${srcReg} from I${j + 1})`);
              }
            }
            break;
          }
        }
      });

      const idCycle = Math.max(ifCycle + 1, requiredId);
      const stall = idCycle - (ifCycle + 1);
      const stages = {
        IF: ifCycle,
        ID: idCycle,
        EX: idCycle + 1,
        MEM: idCycle + 2,
        WB: idCycle + 3,
      };

      rows.push({
        ins,
        index: idx,
        num: idx + 1,
        stall,
        stages,
        forwardSources,
      });
    });

    const cycles = rows.length ? rows[rows.length - 1].stages.WB : 0;
    const stalls = rows.reduce((sum, r) => sum + r.stall, 0);

    return { rows, cycles, stalls, forwardingEnabled };
  }

  function computeRegistersAtCycle(rows, cycle) {
    const regs = { ...INITIAL_REGS };
    rows.forEach((r) => {
      if (r.stages.WB <= cycle) {
        try {
          executeOnRegisters(r.ins, regs);
        } catch {
          // Preserve prior state if a pipeline instruction divides by zero
        }
      }
    });
    return regs;
  }

  function stageActionLabel(stage, row) {
    if (!row) return 'Idle';
    if (stage === 'IF') return `Fetching I${row.num}`;
    if (stage === 'ID') {
      return row.ins.src.length
        ? `Decoding · Reads ${row.ins.src.join(', ')}`
        : `Decoding · Imm ${row.ins.imm}`;
    }
    if (stage === 'EX') {
      if (row.forwardSources.length) {
        return `Fwd: ${row.forwardSources[0]}`;
      }
      return row.ins.op === 'MOV' ? `Passing ${row.ins.dest} value` : `ALU ${row.ins.op}`;
    }
    if (stage === 'MEM') return 'No memory write (pass-through)';
    if (stage === 'WB') return `Writing ${row.ins.dest}`;
    return '';
  }

  let lastStageTokens = ['', '', '', '', ''];

  function drawStages(sim, cy) {
    const stageKeys = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    const cards = $('stages').querySelectorAll('.stage-card');

    stageKeys.forEach((stage, idx) => {
      const card = cards[idx];
      const occupying = sim.rows.find((r) => r.stages[stage] === cy) || null;
      const token = occupying ? `I${occupying.num}:${occupying.ins.raw}` : '';

      card.classList.toggle('on', Boolean(occupying));
      if (token && token !== lastStageTokens[idx]) {
        card.classList.remove('stage-enter');
        void card.offsetWidth; // trigger smooth stage transition on new occupant
        card.classList.add('stage-enter');
      } else if (!token) {
        card.classList.remove('stage-enter');
      }
      lastStageTokens[idx] = token;

      card.querySelector('.stage-inst').textContent = occupying
        ? `I${occupying.num}: ${occupying.ins.raw}`
        : '—';
      card.querySelector('.stage-action').textContent = stageActionLabel(stage, occupying);
    });

    $('cycle').textContent = `Clock Cycle ${cy} / ${sim.cycles}`;
    $('forwardingIndicator').textContent = `Forwarding: ${sim.forwardingEnabled ? 'Enabled' : 'Disabled'}`;

    const stalledRows = sim.rows.filter((r) => cy > r.stages.IF && cy < r.stages.ID);
    $('stallCycleIndicator').textContent = `Stalls this cycle: ${stalledRows.length}`;
    $('stallQueueNote').textContent = stalledRows.length
      ? `RAW Stall in Cycle ${cy}: ${stalledRows.map((r) => `I${r.num} (${r.ins.raw})`).join(', ')} waiting for WB`
      : '';

    const regs = computeRegistersAtCycle(sim.rows, cy);
    $('pipeRegCycle').textContent = cy;
    $('pipeR1').textContent = regs.R1;
    $('pipeR2').textContent = regs.R2;
    $('pipeR3').textContent = regs.R3;

    highlightTimingColumn(cy);
  }

  function highlightTimingColumn(cy) {
    const table = $('timing');
    table.querySelectorAll('.active-col').forEach((el) => el.classList.remove('active-col'));
    if (cy <= 0) return;

    table.querySelectorAll(`[data-cycle="${cy}"]`).forEach((el) => el.classList.add('active-col'));
  }

  function renderTimingTable(sim) {
    if (!sim.rows.length) {
      $('timing').innerHTML =
        '<tbody><tr><td class="empty-cell">Click Run Pipeline to generate the cycle-by-cycle timing diagram.</td></tr></tbody>';
      return;
    }

    let html = '<thead><tr><th class="inst-col">Instruction</th>';
    for (let c = 1; c <= sim.cycles; c += 1) {
      html += `<th class="cycle-col" data-cycle="${c}" title="Jump to Cycle ${c}">C${c}</th>`;
    }
    html += '</tr></thead><tbody>';

    sim.rows.forEach((r) => {
      html += `<tr><th class="inst-col">I${r.num}: ${r.ins.raw}</th>`;
      for (let c = 1; c <= sim.cycles; c += 1) {
        const stageName = Object.keys(r.stages).find((k) => r.stages[k] === c);
        if (stageName) {
          html += `<td class="stagecell stage-${stageName.toLowerCase()}" data-cycle="${c}">${stageName}</td>`;
        } else if (c > r.stages.IF && c < r.stages.ID) {
          html += `<td class="stallcell" data-cycle="${c}">STALL</td>`;
        } else {
          html += `<td data-cycle="${c}">·</td>`;
        }
      }
      html += '</tr>';
    });

    html += '</tbody>';
    $('timing').innerHTML = html;

    $('timing').querySelectorAll('th.cycle-col').forEach((th) => {
      th.addEventListener('click', () => {
        if (!pipeState) return;
        stopAutoRun();
        pipeState.cycle = Number(th.dataset.cycle);
        drawStages(pipeState.sim, pipeState.cycle);
        updatePipelineMessage();
      });
    });
  }

  function updatePipelineMessage() {
    if (!pipeState) return;
    const { cycle, sim } = pipeState;
    if (cycle === 0) {
      $('pipeMessage').textContent = `${sim.rows.length} instructions loaded (${sim.cycles} total cycles, ${sim.stalls} stall cycles). Click Next Cycle or Auto Run.`;
    } else if (cycle >= sim.cycles) {
      $('pipeMessage').textContent = `Pipeline completed in ${sim.cycles} clock cycles (${sim.stalls} stall cycles). All instructions finished WB.`;
    } else {
      $('pipeMessage').textContent = `Cycle ${cycle} of ${sim.cycles}: instructions advancing through pipeline stages.`;
    }
  }

  function stopAutoRun() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    $('auto').textContent = 'Auto Run';
  }

  function runPipelineSimulation(initialCycle = 0) {
    stopAutoRun();
    try {
      const list = parseProgram();
      const fwd = $('forwarding').checked;
      const sim = simulatePipeline(list, fwd);
      pipeState = { sim, cycle: Math.min(initialCycle, sim.cycles) };

      renderTimingTable(sim);
      drawStages(sim, pipeState.cycle);
      updatePipelineMessage();
      renderDiagnosis(list);
      return true;
    } catch (err) {
      $('pipeMessage').textContent = `Error: ${err.message}`;
      return false;
    }
  }

  function stepCycle(delta) {
    if (!pipeState) {
      if (!runPipelineSimulation(0)) return;
    }
    pipeState.cycle = Math.max(0, Math.min(pipeState.cycle + delta, pipeState.sim.cycles));
    drawStages(pipeState.sim, pipeState.cycle);
    updatePipelineMessage();
  }

  $('run').addEventListener('click', () => runPipelineSimulation(1));

  $('next').addEventListener('click', () => {
    if (!pipeState) {
      runPipelineSimulation(1);
      return;
    }
    stepCycle(1);
  });

  $('prev').addEventListener('click', () => {
    if (!pipeState) return;
    stopAutoRun();
    stepCycle(-1);
  });

  $('auto').addEventListener('click', () => {
    if (!pipeState) {
      if (!runPipelineSimulation(0)) return;
    }
    if (autoTimer) {
      stopAutoRun();
      return;
    }
    if (pipeState.cycle >= pipeState.sim.cycles) {
      pipeState.cycle = 0;
      drawStages(pipeState.sim, 0);
    }

    $('auto').textContent = 'Pause';
    const intervalMs = Number($('autoSpeed').value) || 750;
    autoTimer = setInterval(() => {
      if (!pipeState || pipeState.cycle >= pipeState.sim.cycles) {
        stopAutoRun();
        updatePipelineMessage();
        return;
      }
      stepCycle(1);
      if (pipeState.cycle >= pipeState.sim.cycles) {
        stopAutoRun();
      }
    }, intervalMs);
  });

  $('forwarding').addEventListener('change', () => {
    if (pipeState) {
      runPipelineSimulation(Math.min(pipeState.cycle, 1));
    } else {
      $('forwardingIndicator').textContent = `Forwarding: ${$('forwarding').checked ? 'Enabled' : 'Disabled'}`;
    }
  });

  $('resetPipe').addEventListener('click', () => {
    stopAutoRun();
    pipeState = null;
    lastStageTokens = ['', '', '', '', ''];
    drawStages({ rows: [], cycles: 0, forwardingEnabled: $('forwarding').checked }, 0);
    $('cycle').textContent = 'Clock Cycle 0 / 0';
    $('pipeMessage').textContent = 'Pipeline reset. Click Run Pipeline to begin.';
    renderTimingTable({ rows: [], cycles: 0 });
  });

  $('loadExample').addEventListener('click', () => {
    $('programInput').value = PRESET_PROGRAMS.default;
    runPipelineSimulation(1);
  });

  document.querySelectorAll('.pipe-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.prog;
      if (PRESET_PROGRAMS[key]) {
        $('programInput').value = PRESET_PROGRAMS[key];
        runPipelineSimulation(1);
      }
    });
  });

  /* ---------------- Phase 3: Smart Pipeline Doctor ---------------- */

  function findRawDependencies(list) {
    const out = [];
    list.forEach((consumer, cIdx) => {
      consumer.src.forEach((reg) => {
        for (let pIdx = cIdx - 1; pIdx >= 0; pIdx -= 1) {
          if (list[pIdx].dest === reg) {
            const distance = cIdx - pIdx;
            const intrinsicStalls = Math.max(0, 3 - distance);
            const fwdPath =
              distance === 1
                ? 'EX → EX bypass'
                : distance === 2
                  ? 'MEM → EX bypass'
                  : 'Register file (no bypass needed)';

            out.push({
              p: pIdx + 1,
              c: cIdx + 1,
              reg,
              pt: list[pIdx].raw,
              ct: consumer.raw,
              distance,
              intrinsicStalls,
              fwdPath,
            });
            break;
          }
        }
      });
    });
    return out;
  }

  function renderDiagnosis(list) {
    const deps = findRawDependencies(list);
    const simNoFwd = simulatePipeline(list, false);
    const simFwd = simulatePipeline(list, true);
    const n = list.length;

    const hazardStalls = deps.filter((d) => d.intrinsicStalls > 0).length;

    if (!deps.length) {
      $('diagnosis').textContent =
        'No RAW dependencies detected. All instructions are independent and run at peak 1.00 CPI even without forwarding.';
      $('doctorAdvice').textContent =
        'Optimal sequence: 0 stall cycles occur with or without data forwarding.';
    } else if (simNoFwd.stalls === 0) {
      $('diagnosis').textContent = `Detected ${deps.length} RAW dependenc${deps.length === 1 ? 'y' : 'ies'}, all separated by ≥ 3 instructions (0 stall impact).`;
      $('doctorAdvice').textContent =
        'Every producer reaches WB before its consumer enters ID, so no forwarding or stalls are required.';
    } else {
      $('diagnosis').textContent = `Detected ${deps.length} RAW dependenc${deps.length === 1 ? 'y' : 'ies'} (${hazardStalls} causing ${simNoFwd.stalls} stall cycle${simNoFwd.stalls === 1 ? '' : 's'} without forwarding).`;
      $('doctorAdvice').textContent = `Enabling EX→EX and MEM→EX forwarding eliminates ${simNoFwd.stalls} stall cycle${simNoFwd.stalls === 1 ? '' : 's'}, cutting execution from ${simNoFwd.cycles} to ${simFwd.cycles} cycles (${(simNoFwd.cycles / simFwd.cycles).toFixed(2)}× speedup).`;
    }

    const tbody = $('hazards').querySelector('tbody');
    if (!deps.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No RAW dependencies detected in this program.</td></tr>';
    } else {
      tbody.innerHTML = deps
        .map(
          (d) => `<tr>
            <td class="mono-cell">I${d.p}: ${d.pt}</td>
            <td class="mono-cell">I${d.c}: ${d.ct}</td>
            <td class="mono-cell">${d.reg}</td>
            <td>RAW</td>
            <td>${d.intrinsicStalls > 0 ? `${d.intrinsicStalls} stall cycle${d.intrinsicStalls > 1 ? 's' : ''} (dist ${d.distance})` : `0 stalls (dist ${d.distance})`}</td>
            <td><strong>${d.fwdPath}</strong> — I${d.c} reads ${d.reg} written by I${d.p}.</td>
          </tr>`
        )
        .join('');
    }

    const speedup = simNoFwd.cycles / simFwd.cycles;
    const effNoFwd = (n / simNoFwd.cycles) * 100;
    const effFwd = (n / simFwd.cycles) * 100;
    const stallsAvoided = Math.max(0, simNoFwd.stalls - simFwd.stalls);

    const metricItems = [
      ['Instructions', n],
      ['Cycles (No Fwd)', simNoFwd.cycles],
      ['Cycles (With Fwd)', simFwd.cycles],
      ['Stalls Avoided', stallsAvoided],
      ['CPI (No Fwd)', (simNoFwd.cycles / n).toFixed(2)],
      ['CPI (With Fwd)', (simFwd.cycles / n).toFixed(2)],
      ['Speedup', `${speedup.toFixed(2)}×`],
      ['Efficiency (With Fwd)', `${effFwd.toFixed(1)}%`],
    ];

    $('metrics').innerHTML = metricItems
      .map(
        ([label, val]) =>
          `<div class="metric"><span>${label}</span><strong class="tabular">${val}</strong></div>`
      )
      .join('');

    const maxCycles = Math.max(simNoFwd.cycles, simFwd.cycles, 1);
    $('barNoFwdVal').textContent = `${simNoFwd.cycles} cycles · ${effNoFwd.toFixed(1)}% efficiency`;
    $('barFwdVal').textContent = `${simFwd.cycles} cycles · ${effFwd.toFixed(1)}% efficiency`;
    $('barNoFwdFill').style.width = `${(simNoFwd.cycles / maxCycles) * 100}%`;
    $('barFwdFill').style.width = `${(simFwd.cycles / maxCycles) * 100}%`;
  }

  $('diagnose').addEventListener('click', () => {
    try {
      renderDiagnosis(parseProgram());
    } catch (err) {
      $('diagnosis').textContent = `Error: ${err.message}`;
    }
  });

  /* ---------------- Top-Bar Demo Action ---------------- */

  $('quickDemoBtn').addEventListener('click', () => {
    resetCpuDashboard();
    $('instruction').value = 'ADD R3, R1, R2';
    $('executeBtn').click();

    $('programInput').value = PRESET_PROGRAMS.default;
    $('forwarding').checked = true;
    runPipelineSimulation(3);
    switchPage('pipeline');
  });

  /* ---------------- Verified Standalone ZIP Downloader ---------------- */

  function crc32Bytes(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildStoredZipBlob(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach(({ name, text }) => {
      const nameBytes = encoder.encode(name);
      const dataBytes = encoder.encode(text);
      const crc = crc32Bytes(dataBytes);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x5421, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, dataBytes.length, true);
      lv.setUint32(22, dataBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x5421, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, dataBytes.length, true);
      cv.setUint32(24, dataBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      localParts.push(localHeader, dataBytes);
      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    });

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const tempLink = document.createElement('a');
    tempLink.href = url;
    tempLink.download = filename;
    document.body.appendChild(tempLink);
    tempLink.click();
    tempLink.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const zipLink = $('downloadZipLink');
  const zipDiv = $('zipDivider');

  if (window.location.protocol === 'file:') {
    if (zipLink) zipLink.style.display = 'none';
    if (zipDiv) zipDiv.style.display = 'none';
  } else if (zipLink) {
    zipLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const originalText = zipLink.textContent;
      zipLink.textContent = 'Preparing ZIP...';

      try {
        const res = await fetch('Future_Smart_CPU.zip', { credentials: 'same-origin' });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          if (bytes.length > 22 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
            triggerBlobDownload(new Blob([buf], { type: 'application/zip' }), 'Future_Smart_CPU.zip');
            zipLink.textContent = 'Downloaded ZIP';
            setTimeout(() => {
              zipLink.textContent = originalText;
            }, 2200);
            return;
          }
        }

        const files = ['index.html', 'style.css', 'script.js', 'README.md'];
        const contents = await Promise.all(
          files.map(async (f) => {
            const r = await fetch(f, { credentials: 'same-origin' });
            if (!r.ok) throw new Error(`Failed to read ${f}`);
            return { name: `Future_Smart_CPU/${f}`, text: await r.text() };
          })
        );
        const blob = buildStoredZipBlob(contents);
        triggerBlobDownload(blob, 'Future_Smart_CPU.zip');
        zipLink.textContent = 'Downloaded ZIP';
      } catch (err) {
        zipLink.textContent = `Download error: ${err.message}`;
      } finally {
        setTimeout(() => {
          zipLink.textContent = originalText;
        }, 2500);
      }
    });
  }

  /* Initialize Doctor metrics on first load using default program */
  try {
    renderDiagnosis(parseProgram());
  } catch {
    // Ignore on initial load
  }
})();
