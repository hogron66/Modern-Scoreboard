"use strict";

const STORAGE_KEY = "subbuteo-scoreboard-modern-state-v1";
const DEFAULT_SECONDS = 45 * 60;

const elements = {
  leagueTitle: document.querySelector("#leagueTitle"),
  teamAName: document.querySelector("#teamAName"),
  teamBName: document.querySelector("#teamBName"),
  scoreA: document.querySelector("#scoreA"),
  scoreB: document.querySelector("#scoreB"),
  timerMinutes: document.querySelector("#timerMinutes"),
  timerSeconds: document.querySelector("#timerSeconds"),
  clock: document.querySelector("#clock"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  resetTimerButton: document.querySelector("#resetTimerButton"),
  crowdButton: document.querySelector("#crowdButton"),
  resetScoresButton: document.querySelector("#resetScoresButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  installButton: document.querySelector("#installButton"),
  toast: document.querySelector("#toast"),
  whistleSound: document.querySelector("#whistleSound"),
  cheerSound: document.querySelector("#cheerSound"),
  crowdLoopSound: document.querySelector("#crowdLoopSound")
};

let state = {
  leagueTitle: "Subbuteo League",
  teamAName: "Home team",
  teamBName: "Visiting team",
  scoreA: 0,
  scoreB: 0,
  durationSeconds: DEFAULT_SECONDS,
  remainingSeconds: DEFAULT_SECONDS,
  running: false,
  endTime: null,
  crowdEnabled: false
};

let timerId = null;
let deferredInstallPrompt = null;
let toastTimer = null;
let timerInputDirty = false;

function clampScore(value) {
  return Math.max(0, Math.min(999, Number(value) || 0));
}

function normalizeText(value, fallback, maximumLength) {
  const text = String(value || "").trim().slice(0, maximumLength);
  return text || fallback;
}

function splitTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return { minutes, seconds };
}

function parseTimeFields() {
  const minutesText = elements.timerMinutes.value.trim();
  const secondsText = elements.timerSeconds.value.trim();
  if (!/^\d{1,3}$/.test(minutesText) || !/^\d{1,2}$/.test(secondsText)) return null;
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  if (seconds > 59) return null;
  const total = minutes * 60 + seconds;
  return total > 0 ? total : null;
}

function renderTime(totalSeconds) {
  const { minutes, seconds } = splitTime(totalSeconds);
  elements.timerMinutes.value = minutes;
  elements.timerSeconds.value = seconds;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return;
    state = {
      ...state,
      ...saved,
      leagueTitle: normalizeText(saved.leagueTitle, "Subbuteo League", 30),
      teamAName: normalizeText(saved.teamAName, "Home team", 15),
      teamBName: normalizeText(saved.teamBName, "Visiting team", 15),
      scoreA: clampScore(saved.scoreA),
      scoreB: clampScore(saved.scoreB),
      durationSeconds: Math.max(1, Number(saved.durationSeconds) || DEFAULT_SECONDS),
      remainingSeconds: Math.max(0, Number(saved.remainingSeconds) || 0),
      running: Boolean(saved.running && saved.endTime),
      endTime: saved.endTime ? Number(saved.endTime) : null,
      crowdEnabled: false
    };
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, crowdEnabled: false }));
}

function updateRemainingFromClock() {
  if (!state.running || !state.endTime) return;
  state.remainingSeconds = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
}

function render() {
  elements.leagueTitle.value = state.leagueTitle;
  elements.teamAName.value = state.teamAName;
  elements.teamBName.value = state.teamBName;
  elements.scoreA.value = state.scoreA;
  elements.scoreA.textContent = state.scoreA;
  elements.scoreB.value = state.scoreB;
  elements.scoreB.textContent = state.scoreB;
  renderTime(state.remainingSeconds);
  elements.timerMinutes.readOnly = state.running;
  elements.timerSeconds.readOnly = state.running;
  elements.startButton.disabled = state.running;
  elements.pauseButton.disabled = !state.running;
  elements.crowdButton.textContent = state.crowdEnabled ? "Crowd on" : "Crowd off";
  elements.crowdButton.setAttribute("aria-pressed", String(state.crowdEnabled));
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function playSound(audio, restart = true) {
  if (!audio) return;
  if (restart) audio.currentTime = 0;
  const playback = audio.play();
  if (playback && typeof playback.catch === "function") playback.catch(() => {});
}

function playWhistle() {
  playSound(elements.whistleSound);
}

function playCheer() {
  playSound(elements.cheerSound);
}

function startCrowd() {
  elements.crowdLoopSound.volume = 0.55;
  playSound(elements.crowdLoopSound);
}

function stopCrowd() {
  elements.crowdLoopSound.pause();
  elements.crowdLoopSound.currentTime = 0;
}

function finishMatch() {
  state.running = false;
  state.endTime = null;
  state.remainingSeconds = 0;
  clearInterval(timerId);
  timerId = null;
  playWhistle();
  saveState();
  render();
}

function tick() {
  updateRemainingFromClock();
  renderTime(state.remainingSeconds);
  if (state.running && state.remainingSeconds === 0) finishMatch();
}

function startTicker() {
  clearInterval(timerId);
  timerId = setInterval(tick, 250);
}

function applyTimerInput() {
  if (state.running) return true;
  if (!timerInputDirty) return true;
  const parsed = parseTimeFields();
  if (parsed === null) {
    renderTime(state.remainingSeconds);
    timerInputDirty = false;
    showToast("Enter minutes and seconds between 00 and 59.");
    return false;
  }
  state.durationSeconds = parsed;
  state.remainingSeconds = parsed;
  timerInputDirty = false;
  saveState();
  render();
  return true;
}

function startTimer() {
  if (state.running || !applyTimerInput()) return;
  state.running = true;
  state.endTime = Date.now() + state.remainingSeconds * 1000;
  playWhistle();
  startTicker();
  saveState();
  render();
}

function pauseTimer() {
  if (!state.running) return;
  updateRemainingFromClock();
  state.running = false;
  state.endTime = null;
  clearInterval(timerId);
  timerId = null;
  playWhistle();
  saveState();
  render();
}

function resetTimer() {
  const wasRunning = state.running;
  state.running = false;
  state.endTime = null;
  state.remainingSeconds = state.durationSeconds || DEFAULT_SECONDS;
  clearInterval(timerId);
  timerId = null;
  if (wasRunning) playWhistle();
  saveState();
  render();
}

function updateScore(team, change) {
  const key = team === "A" ? "scoreA" : "scoreB";
  state[key] = clampScore(state[key] + change);
  playCheer();
  saveState();
  render();
}

function resetScores() {
  state.scoreA = 0;
  state.scoreB = 0;
  saveState();
  render();
}

function toggleCrowd() {
  state.crowdEnabled = !state.crowdEnabled;
  if (state.crowdEnabled) startCrowd();
  else stopCrowd();
  render();
}

async function toggleFullscreen() {
  const root = document.documentElement;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (root.requestFullscreen) {
      await root.requestFullscreen();
    } else if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    } else {
      showToast("On iPhone or iPad: use Share, then Add to Home Screen.");
    }
  } catch (_error) {
    showToast("Fullscreen is available after installing the app.");
  }
}

function updateClock() {
  elements.clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

function bindTextInput(element, stateKey, fallback, maximumLength) {
  const commit = () => {
    state[stateKey] = normalizeText(element.value, fallback, maximumLength);
    saveState();
    render();
  };
  element.addEventListener("change", commit);
  element.addEventListener("blur", commit);
}

function bindEvents() {
  document.querySelectorAll("[data-score-team]").forEach((button) => {
    button.addEventListener("click", () => {
      updateScore(button.dataset.scoreTeam, Number(button.dataset.scoreChange));
    });
  });
  elements.startButton.addEventListener("click", startTimer);
  elements.pauseButton.addEventListener("click", pauseTimer);
  elements.resetTimerButton.addEventListener("click", resetTimer);
  elements.crowdButton.addEventListener("click", toggleCrowd);
  elements.resetScoresButton.addEventListener("click", resetScores);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  [elements.timerMinutes, elements.timerSeconds].forEach((field) => {
    field.addEventListener("input", () => {
      timerInputDirty = true;
      field.value = field.value.replace(/\D/g, "");
    });
    field.addEventListener("change", applyTimerInput);
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applyTimerInput();
        field.blur();
      }
    });
  });
  bindTextInput(elements.leagueTitle, "leagueTitle", "Subbuteo League", 30);
  bindTextInput(elements.teamAName, "teamAName", "Home team", 15);
  bindTextInput(elements.teamBName, "teamBName", "Visiting team", 15);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tick();
      updateClock();
    }
  });
  window.addEventListener("pagehide", saveState);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });
  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    elements.installButton.hidden = true;
    showToast("Scoreboard installed and ready for offline use.");
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") {
    if (location.protocol === "file:") {
      showToast("Publish or serve this folder once to enable installation and offline use.");
    }
    return;
  }
  try {
    await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
  } catch (_error) {
    showToast("Offline setup could not be completed in this browser.");
  }
}

loadState();
updateRemainingFromClock();
if (state.running && state.remainingSeconds === 0) {
  state.running = false;
  state.endTime = null;
}
bindEvents();
render();
updateClock();
setInterval(updateClock, 1000);
if (state.running) startTicker();
registerServiceWorker();
