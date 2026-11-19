# Future Smart CPU — Interactive CPU Simulator & Smart Pipeline Doctor

A browser-based **Computer Architecture** educational project built strictly with **HTML5**, **CSS3**, and **Vanilla JavaScript** (zero backend, zero database, zero external APIs).

## Features

- **Phase 1 — CPU Dashboard**
  - Editable General Purpose Registers (`R1 = 10`, `R2 = 5`, `R3 = 0`) with live read/write highlights.
  - Control Unit decode signals (`Opcode`, `Target`, `Inputs`), ALU status and expression readout, Instruction Counter, System Status, and chronological Memory/Instruction History.
  - Supports `MOV`, `ADD`, `SUB`, `MULT`, and `DIV` with full syntax validation and division-by-zero protection.
- **Phase 2 — Five-Stage Pipeline Simulator**
  - Collision-free in-order 5-stage pipeline (`IF`, `ID`, `EX`, `MEM`, `WB`) with smooth stage transitions.
  - Supports up to 20 instructions per program, Data Forwarding toggle (`EX → EX` and `MEM → EX`), `Run Pipeline`, `Prev Cycle`, `Next Cycle`, `Auto Run / Pause`, adjustable speed, clickable cycle columns in the timing diagram, and live architectural register preview.
- **Phase 3 — Smart Pipeline Doctor**
  - Detects Read-After-Write (RAW) dependencies, producer/consumer distance, stall impact without forwarding, and exact forwarding paths.
  - Computes Total Cycles, Stalls Avoided, CPI (with/without forwarding), Speedup, and Pipeline Efficiency (`N / Cycles × 100%`) alongside visual comparison bars.
- **Learn**
  - Concise study guide covering CPU components, the five pipeline stages, RAW hazards, stalls vs forwarding, performance formulas, and interactive viva Q&A cards.

## How to Run Locally

1. Open the project folder in **VS Code**.
2. Open `index.html` directly in **Google Chrome** (or launch via VS Code **Live Server**).
3. No backend server, database, package install, or internet connection is required.

## Suggested College Viva Demo Flow

1. **CPU Dashboard**: Execute `ADD R3, R1, R2` (result `R3 = 15`), then test `MOV R1, 20` and a division-by-zero check (`MOV R2, 0` followed by `DIV R3, R1, R2`) to show error handling.
2. **Pipeline Simulator**: Click **Run Pipeline** with forwarding enabled, step with **Next Cycle** or **Auto Run** (9 cycles total), then uncheck **Enable data forwarding** to observe `STALL` bubbles extending execution to 15 cycles.
3. **Smart Pipeline Doctor**: Click **Diagnose Program** to inspect all RAW dependencies, bypass paths (`EX → EX`, `MEM → EX`), speedup, and efficiency comparison.

## Simulation Model Assumptions

- Five-stage in-order pipeline (`IF`, `ID`, `EX`, `MEM`, `WB`) with split-cycle register file access (WB writes in the first half of the cycle; ID reads in the second half).
- Without forwarding, a dependent consumer waits in `ID` until the producer reaches `WB` (2 stalls at distance 1; 1 stall at distance 2; 0 stalls at distance ≥ 3).
- With forwarding enabled, ALU and `MOV` results bypass directly from `EX/MEM` or `MEM/WB` without data stalls.
- Simplified educational model: cache misses, branch prediction, load-use latency, and out-of-order execution are not simulated.
