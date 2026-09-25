const screen = document.querySelector("#screen");
const progressBar = document.querySelector("#progressBar");
const stepCount = document.querySelector("#stepCount");
const stepLabel = document.querySelector("#stepLabel");
const confetti = document.querySelector("#confetti");
const toast = document.querySelector("#toast");
const apiBaseUrl = String(window.BOOK_JAS_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
const trackingEnabled = Boolean(apiBaseUrl);
const pageOpenedAt = new Date().toISOString();

function createSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const state = {
  step: 1,
  selectedDays: 3,
  selectedActivities: [],
  smileChoice: "",
  futureSlot: false,
  dodges: 0,
  lastEscapeAt: 0,
  sessionId: createSessionId(),
  visitorName: "",
  trackingConsent: false,
  submitted: false,
  furthestStep: 1,
  stepTimeline: [{ step: 1, label: "REQUEST RECEIVED", at: pageOpenedAt }],
};

const activities = [
  "Chai",
  "Coffee",
  "Movie",
  "Bike ride",
  "Trip / travel",
  "Rooftop café",
  "Something new",
  "Talk openly",
  "Stand-up comedy",
  "Cuddle, if comfy",
  "Hug, if comfy",
  "Kiss, if comfy",
  "Pottery class",
  "Gay party",
  "Clubbing",
  "Home repair",
  "Cleaning",
  "Hindi shayari evening",
  "Pani puri trail",
  "Camping under the stars",
  "Water park day",
  "Helicopter ride to Shimla",
  "Sunrise picnic at Sukhna Lake",
  "Mystery date planned by Jas",
  "Make a time capsule",
  "Recreate a favourite memory",
  "Cook a new recipe together",
  "Stargazing and late-night talks",
  "No-phone adventure day",
  "Thrift-store outfit challenge",
  "Karaoke duet",
  "Make a mini-film together",
  "Discuss wedding outfits, hypothetically",
  "Buy a ring, purely for research",
  "Name our imaginary children",
  "Choose a fictional honeymoon",
  "Design our completely imaginary home",
  "Name our future pets",
  "Practice a terrible wedding dance",
  "Decide who steals the blanket",
  "Draft our 50-year master plan",
  "Choose matching retirement chairs",
];

const icons = {
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.35-9.33-8.27C.81 9.6 2.2 5.5 5.82 4.46 8.05 3.82 10.2 4.7 12 6.6c1.8-1.9 3.95-2.78 6.18-2.14 3.62 1.04 5.01 5.14 3.15 8.27C19 16.65 12 21 12 21Z" /></svg>`,
};

const dodgeLines = [
  "No",
  "Wait, really?",
  "Think again",
  "Too slow",
  "Nice try",
  "Are you sure?",
  "Three days sounds good",
  "Still chasing me?",
  "Nope, over here",
  "Okay, one more try",
];

function setProgress(step, label) {
  const changed = state.step !== step || stepLabel.textContent !== label;
  state.step = step;
  state.furthestStep = Math.max(state.furthestStep, step);
  stepCount.textContent = `${String(step).padStart(2, "0")} / 06`;
  stepLabel.textContent = label;
  progressBar.style.width = `${(step / 6) * 100}%`;

  if (changed) {
    state.stepTimeline.push({ step, label, at: new Date().toISOString() });
    if (state.trackingConsent) {
      sendTrackingEvent("step_viewed", { step, label });
    }
  }
}

function swapScreen(markup) {
  state.dodges = 0;
  screen.style.animation = "none";
  screen.offsetHeight;
  screen.innerHTML = markup;
  screen.style.animation = "";
  screen.querySelector("button:not(.evade-button), a")?.focus({ preventScroll: true });

  if (window.matchMedia("(max-width: 720px)").matches) {
    window.requestAnimationFrame(() => {
      const card = document.querySelector(".booking-card");
      const cardTop = card.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, cardTop - 8), behavior: "auto" });
    });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function playfulNo(label = "No") {
  return `<button class="secondary-button evade-button" type="button" data-evade="true" aria-label="${label}, playful moving button">${label}</button>`;
}

function showIntro() {
  state.selectedDays = 3;
  state.selectedActivities = [];
  state.smileChoice = "";
  state.futureSlot = false;
  state.submitted = false;
  setProgress(1, "REQUEST RECEIVED");

  const startControls = trackingEnabled
    ? `
      <div class="visitor-details">
        <label for="visitorName">Your name</label>
        <input id="visitorName" type="text" maxlength="80" autocomplete="name" placeholder="What should Jas call you?" />
        <label class="consent-check" for="trackingConsent">
          <input id="trackingConsent" type="checkbox" />
          <span>Is jas cute.</span>
        </label>
      </div>
      <div class="decision-area">
        <button class="primary-button" type="button" data-action="start-tracked-booking" disabled>
          Review Jas's application ${icons.arrow}
        </button>
        ${playfulNo("No, looks suspicious", "review")}
      </div>
      <p class="tiny-note">Nothing is sent until you enter your name and agree.</p>
    `
    : `
      <div class="decision-area">
        <button class="primary-button" type="button" data-action="review">
          Review Jas's application ${icons.arrow}
        </button>
        ${playfulNo("No, looks suspicious", "review")}
      </div>
      <p class="tiny-note">Application fee: one smile. Already received.</p>
    `;

  swapScreen(`
    <p class="eyebrow">Official Date Planning Department</p>
    <h1>A very important <span class="script-word">booking request.</span></h1>
    <p class="lead">
      One charming date is waiting to happen.
      Your official response is required.
    </p>
    <div class="trip-ticket" aria-label="Date pairing for you and Jas">
      <div class="city"><strong>You</strong><span>Choose the vibe</span></div>
      <div class="ticket-route">${icons.heart}</div>
      <div class="city"><strong>Jas</strong><span>Brings the charm</span></div>
    </div>
    ${startControls}
  `);
}

function showSeeJas() {
  setProgress(2, "IMPORTANT QUESTION");
  swapScreen(`
    <p class="eyebrow">Let's establish the obvious</p>
    <h2>Do you want to see <span class="script-word">Jas?</span></h2>
    <p class="lead">
      Careful—your answer may result in terrible jokes, familiar chaos,
      and an annoyingly good time.
    </p>
    <div class="decision-area">
      <button class="primary-button" type="button" data-action="yes">
        Yes, obviously ${icons.arrow}
      </button>
      ${playfulNo("No", "yes")}
    </div>
    <p class="tiny-note">The portal appreciates your excellent judgement.</p>
  `);
}

function showDayPicker() {
  setProgress(3, "CHOOSE YOUR PACKAGE");
  swapScreen(`
    <p class="eyebrow">Date length</p>
    <h2>How much time are you booking with <span class="script-word">him?</span></h2>
    <p class="lead">Select carefully. Jas packs at least three days' worth of charm.</p>
    <div class="days-grid">
      <button class="day-button" type="button" data-days="1">1 day<small>blink and it's gone</small></button>
      <button class="day-button" type="button" data-days="2">2 days<small>getting warmer</small></button>
      <button class="day-button recommended" type="button" data-days="3">
        <span class="recommend-tag">best choice</span>
        3 days<small>scientifically perfect</small>
      </button>
      <button class="day-button" type="button" data-days="4">4 days<small>bold, but suspicious</small></button>
      <button class="day-button lifetime" type="button" data-days="lifetime">Lifetime<small>well, that escalated beautifully</small></button>
    </div>
    <div class="decision-area" style="margin-top: 16px">
      ${playfulNo("Actually, zero days", "confirm-three")}
    </div>
  `);
}

const reactions = {
  1: {
    eyebrow: "Mathematical emergency",
    title: "Can all this fun fit into <span class=\"script-word\">one day?</span>",
    message:
      "Physics says no. One day is just arrival chai, one argument about food, and then an unnecessarily dramatic goodbye. Terrible planning.",
    accept: "Fine, make it 3 days",
    refuse: "One day is plenty",
  },
  2: {
    eyebrow: "Fun audit required",
    title: "Who leaves exactly when the <span class=\"script-word\">fun starts?</span>",
    message:
      "Day one is for pretending this is casual. Day two is for finally relaxing. Obviously day three is where the good part happens.",
    accept: "Okay, 3 days wins",
    refuse: "I reject this science",
  },
};

function showReaction(choice) {
  const reaction = reactions[choice];
  setProgress(3, "NEGOTIATION IN PROGRESS");
  swapScreen(`
    <p class="eyebrow">${reaction.eyebrow}</p>
    <h2>${reaction.title}</h2>
    <div class="reaction-box">
      <strong>Official note from the Jas Date Department</strong>
      <p>${reaction.message}</p>
    </div>
    <div class="decision-area">
      <button class="primary-button" type="button" data-action="confirm-three">
        ${reaction.accept} ${icons.arrow}
      </button>
      ${playfulNo(reaction.refuse, "confirm-three")}
    </div>
  `);
}

function showActivities(days) {
  state.selectedDays = days;
  state.selectedActivities = [];
  state.smileChoice = "";
  setProgress(4, "PLAN THE FUN");

  const duration = days === "lifetime" ? "the Lifetime package" : `${days} days`;
  const activityButtons = activities
    .map(
      (activity) => `<button class="activity-chip" type="button" data-activity="${activity}" aria-pressed="false">${activity}</button>`,
    )
    .join("");

  swapScreen(`
    <p class="eyebrow">${duration} selected</p>
    <h2>What do you want to do with <span class="script-word">Jas?</span></h2>
    <p class="lead">Pick as many as you like. A good booking deserves a dangerously good itinerary.</p>
    <div id="activityGrid" class="activity-grid" aria-label="Choose activities">
      ${activityButtons}
    </div>
    <div class="custom-activity-panel">
      <label for="customActivityInput">Add your own ideas</label>
      <p>Add one idea, or separate several ideas with commas. Every new idea is selected automatically.</p>
      <div class="custom-activity-row">
        <input id="customActivityInput" type="text" maxlength="320" autocomplete="off" placeholder="Beach trip, learn salsa, midnight drive..." />
        <button class="secondary-button" type="button" data-action="add-custom-activities">Add options</button>
      </div>
    </div>
    <p id="activityCount" class="selection-summary">Choose at least one adventure.</p>
    <div class="decision-area">
      <button class="primary-button" type="button" data-action="activities-confirm" disabled>
        Build our booking ${icons.arrow}
      </button>
      ${playfulNo("No plans, just vibes")}
    </div>
  `);
}

function showSmileChoice() {
  setProgress(5, "SMILE TAX");
  swapScreen(`
    <p class="eyebrow">One last important matter</p>
    <h2>If this made you <span class="script-word">smile...</span></h2>
    <p class="lead">The booking portal requires one highly unofficial form of payment. You may choose the appropriate response to Jas's audacity.</p>
    <div class="smile-options">
      <button class="smile-choice kiss-choice" type="button" data-smile-choice="A kiss, if mutually wanted">
        Kiss Jas
        <small>Sweet, bold, and only if you want to.</small>
      </button>
      <button class="smile-choice" type="button" data-smile-choice="One dramatic slap for the audacity">
        Slap Jas
        <small>A strictly theatrical review of this website.</small>
      </button>
    </div>
    <div class="decision-area">
      ${playfulNo("I definitely did not smile")}
    </div>
  `);
}

function showConfirmation() {
  setProgress(6, "BOOKING APPROVED");

  const durationLabel = state.selectedDays === "lifetime"
    ? "Lifetime (bold choice)"
    : `${state.selectedDays} ${Number(state.selectedDays) === 1 ? "day" : "days"}`;
  const activitiesLabel = escapeHtml(state.selectedActivities.join(", "));
  const visitorLabel = state.visitorName
    ? `<div class="receipt-row"><span>Booked by</span><strong>${escapeHtml(state.visitorName)}</strong></div>`
    : "";
  const submissionMessage = trackingEnabled && state.trackingConsent
    ? `<p id="serverSubmissionStatus" class="submission-status" role="status">Sending your choices securely to Jas...</p>`
    : "";
  const shareExplanation = trackingEnabled && state.trackingConsent
    ? "Your choices are sent to Jas through the secure booking server. You can also create a booking-card image to keep or share."
    : "Nothing is sent or saved automatically. Tap below to create a booking-card image, then share it with Jas. If sharing is unavailable, the image will download for you.";
  const finalLine = state.selectedDays === "lifetime"
    ? "The lifetime package has been accepted. The portal is impressed, slightly emotional, and checking the closet space."
    : Number(state.selectedDays) === 4
      ? "Four excellent days. The Date Planning Department has officially upgraded you to premium-date status."
      : "A suspiciously perfect amount of time. Jas promises good conversation and only a manageable level of chaos.";

  swapScreen(`
    <p class="eyebrow">It's official</p>
    <h2>Jas has been <span class="script-word">booked.</span></h2>
    <p class="lead">${finalLine}</p>
    <div class="receipt" aria-label="Booking details">
      ${visitorLabel}
      <div class="receipt-row"><span>Guest</span><strong>Jas</strong></div>
      <div class="receipt-row"><span>Pairing</span><strong>You + Jas</strong></div>
      <div class="receipt-row"><span>Duration</span><strong>${durationLabel}</strong></div>
      <div class="receipt-row"><span>Our plans</span><strong>${activitiesLabel}</strong></div>
      <div class="receipt-row"><span>Smile tax</span><strong>${state.smileChoice}</strong></div>
      <div class="receipt-row"><span>Future pampering</span><strong id="futureStatus">Slots available after this stay</strong></div>
    </div>
    <span class="stamp">Date approved</span>
    <div class="future-card">
      <span class="future-kicker">Future access now open</span>
      <h3>If you want to be pampered like this again...</h3>
      <p>Your current time together is already booked. Future Jas slots are also available for another round of attention, chai, plans, and being thoroughly spoiled.</p>
      <button class="primary-button" type="button" data-action="future-slot">
        Save me a future pampering slot ${icons.arrow}
      </button>
    </div>
    <div class="share-card">
      <span class="future-kicker">Your selections are ready</span>
      <h3>Send this booking to Jas</h3>
      ${submissionMessage}
      <p>${shareExplanation}</p>
      <button class="primary-button" type="button" data-action="share-booking">
        Send booking to Jas ${icons.arrow}
      </button>
    </div>
    <div class="button-row" style="margin-top: 26px">
      <button class="primary-button" type="button" data-action="copy">Copy booking receipt</button>
      ${playfulNo("Cancel booking", "confirm-three")}
    </div>
  `);

  celebrate();
  submitBooking();
}

function celebrate() {
  const colors = ["#d9345b", "#f26b5e", "#f4ad42", "#ffb7c5", "#7d3f58"];
  for (let i = 0; i < 54; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty("--duration", `${2.4 + Math.random() * 2}s`);
    piece.style.setProperty("--drift", `${-90 + Math.random() * 180}px`);
    piece.style.animationDelay = `${Math.random() * 0.7}s`;
    confetti.appendChild(piece);
  }
  window.setTimeout(() => confetti.replaceChildren(), 5000);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function getDeviceSummary() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform || "unknown",
    language: navigator.language || "unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    touchPoints: navigator.maxTouchPoints || 0,
    connection: connection?.effectiveType || "unknown",
    referrer: document.referrer || "direct",
  };
}

function trackingPayload(eventType, details = {}) {
  return {
    sessionId: state.sessionId,
    eventType,
    occurredAt: new Date().toISOString(),
    openedAt: pageOpenedAt,
    name: state.visitorName,
    consent: state.trackingConsent,
    pageUrl: window.location.href,
    details,
  };
}

async function sendTrackingEvent(eventType, details = {}, useBeacon = false) {
  if (!trackingEnabled || !state.trackingConsent) return false;

  const payload = JSON.stringify(trackingPayload(eventType, details));
  const endpoint = `${apiBaseUrl}/api/events`;

  if (useBeacon && typeof navigator.sendBeacon === "function") {
    return navigator.sendBeacon(
      endpoint,
      new Blob([payload], { type: "text/plain;charset=UTF-8" }),
    );
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: payload,
      mode: "cors",
      keepalive: true,
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function updateStartButton() {
  const nameInput = document.querySelector("#visitorName");
  const consentInput = document.querySelector("#trackingConsent");
  const startButton = document.querySelector('[data-action="start-tracked-booking"]');
  if (!nameInput || !consentInput || !startButton) return;
  startButton.disabled = nameInput.value.trim().length < 2 || !consentInput.checked;
}

function startTrackedBooking(button) {
  const nameInput = document.querySelector("#visitorName");
  const consentInput = document.querySelector("#trackingConsent");
  const name = nameInput?.value.trim().replace(/\s+/g, " ").slice(0, 80) || "";

  if (name.length < 2 || !consentInput?.checked) {
    showToast("Add your name and agree before continuing.");
    return;
  }

  state.visitorName = name;
  state.trackingConsent = true;
  button.disabled = true;
  button.textContent = "Starting securely...";

  sendTrackingEvent("session_started", {
    device: getDeviceSummary(),
    firstStep: 1,
  });
  showSeeJas();
}

async function submitBooking() {
  if (!trackingEnabled || !state.trackingConsent || state.submitted) return;
  state.submitted = true;

  const status = document.querySelector("#serverSubmissionStatus");
  const saved = await sendTrackingEvent("booking_submitted", {
    duration: state.selectedDays,
    activities: state.selectedActivities,
    smileChoice: state.smileChoice,
    futureSlot: state.futureSlot,
    furthestStep: state.furthestStep,
    stepTimeline: state.stepTimeline,
    device: getDeviceSummary(),
  });

  if (status) {
    status.textContent = saved
      ? "Sent securely to Jas. You can still share the booking card below."
      : "The server could not be reached. Your choices were not saved—please use the share button below.";
    status.classList.toggle("submission-error", !saved);
  }
}

async function copyReceipt() {
  const duration = state.selectedDays === "lifetime"
    ? "Lifetime"
    : `${state.selectedDays} ${Number(state.selectedDays) === 1 ? "day" : "days"}`;
  const future = state.futureSlot ? "Future pampering priority requested" : "Future slots available";
  const receipt = `Booking confirmed: You + Jas | Duration: ${duration} | Plans: ${state.selectedActivities.join(", ")} | Smile tax: ${state.smileChoice} | ${future}.`;

  try {
    await navigator.clipboard.writeText(receipt);
    showToast("Booking receipt copied. Very official.");
  } catch {
    showToast("Screenshot this receipt—equally official.");
  }
}

function roundedCanvasRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  });

  if (line) context.fillText(line, x, currentY);
  return currentY + lineHeight;
}

async function createBookingCardBlob() {
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement("canvas");
  const activityText = state.selectedActivities.join("  •  ");
  const estimatedActivityLines = Math.max(1, Math.ceil(activityText.length / 44));
  const canvasHeight = Math.max(1900, 1900 + Math.max(0, estimatedActivityLines - 12) * 42);
  canvas.width = 1080;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, 1080, canvasHeight);
  background.addColorStop(0, "#fff8f1");
  background.addColorStop(0.52, "#ffe9e5");
  background.addColorStop(1, "#fff5eb");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255,255,255,0.9)";
  roundedCanvasRect(context, 64, 64, 952, canvasHeight - 128, 46);
  context.fill();

  context.fillStyle = "#d9345b";
  roundedCanvasRect(context, 112, 112, 74, 74, 22);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "700 38px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("♥", 149, 162);

  context.textAlign = "left";
  context.fillStyle = "#3d1d2a";
  context.font = "700 31px Arial, sans-serif";
  context.fillText("BOOK JAS", 212, 160);
  context.textAlign = "right";
  context.fillStyle = "#78515f";
  context.font = "700 22px Arial, sans-serif";
  context.fillText("YOU  +  JAS", 948, 158);

  context.textAlign = "left";
  context.fillStyle = "#b31f47";
  context.font = "700 20px Arial, sans-serif";
  context.fillText("DATE-APPROVED BOOKING", 112, 268);
  context.fillStyle = "#3d1d2a";
  context.font = "700 62px Arial, sans-serif";
  context.fillText("Jas has been booked.", 112, 348);
  context.fillStyle = "#78515f";
  context.font = "400 27px Arial, sans-serif";
  context.fillText("Wherever you are — officially worth the date.", 112, 400);

  context.fillStyle = "#fff1f2";
  roundedCanvasRect(context, 112, 456, 856, 148, 28);
  context.fill();
  context.fillStyle = "#78515f";
  context.font = "700 19px Arial, sans-serif";
  context.fillText("DURATION", 148, 504);
  context.fillStyle = "#b31f47";
  context.font = "700 42px Arial, sans-serif";
  const duration = state.selectedDays === "lifetime"
    ? "Lifetime (bold choice)"
    : `${state.selectedDays} ${Number(state.selectedDays) === 1 ? "day" : "days"}`;
  context.fillText(duration, 148, 558);

  let y = 680;
  context.fillStyle = "#b31f47";
  context.font = "700 19px Arial, sans-serif";
  context.fillText("OUR PLANS", 112, y);
  y += 48;
  context.fillStyle = "#3d1d2a";
  context.font = "600 29px Arial, sans-serif";
  y = drawWrappedText(context, activityText, 112, y, 856, 42);

  y += 34;
  context.strokeStyle = "rgba(114,45,67,0.16)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(112, y);
  context.lineTo(968, y);
  context.stroke();

  y += 62;
  context.fillStyle = "#78515f";
  context.font = "700 19px Arial, sans-serif";
  context.fillText("SMILE TAX", 112, y);
  y += 45;
  context.fillStyle = "#3d1d2a";
  context.font = "600 28px Arial, sans-serif";
  y = drawWrappedText(context, state.smileChoice, 112, y, 856, 40);

  y += 34;
  context.fillStyle = state.futureSlot ? "#eaf7ee" : "#fff7ed";
  roundedCanvasRect(context, 112, y, 856, 132, 24);
  context.fill();
  context.fillStyle = state.futureSlot ? "#28744a" : "#9a5b27";
  context.font = "700 20px Arial, sans-serif";
  context.fillText("FUTURE PAMPERING", 146, y + 47);
  context.fillStyle = "#3d1d2a";
  context.font = "600 27px Arial, sans-serif";
  context.fillText(state.futureSlot ? "Priority slot requested" : "Future slots available", 146, y + 92);

  context.fillStyle = "#d9345b";
  context.font = "700 24px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("Send this booking card to Jas", 540, canvasHeight - 150);
  context.fillStyle = "#78515f";
  context.font = "400 20px Arial, sans-serif";
  context.fillText("Made with unreasonable confidence.", 540, canvasHeight - 108);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create booking image."));
    }, "image/png");
  });
}

function downloadBookingCard(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "jas-booking-card.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function shareBookingCard(button) {
  const originalContent = button.innerHTML;
  button.disabled = true;
  button.textContent = "Preparing your booking card...";

  try {
    const blob = await createBookingCardBlob();
    if (typeof File !== "function") {
      downloadBookingCard(blob);
      showToast("Image downloaded—send it to Jas.");
      return;
    }
    const file = new File([blob], "jas-booking-card.png", { type: "image/png" });
    const canShareFile = typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] });

    if (canShareFile) {
      await navigator.share({
        title: "My booking with Jas",
        text: "Booking approved. Here are my selections.",
        files: [file],
      });
      showToast("Booking card ready for Jas.");
    } else {
      downloadBookingCard(blob);
      showToast("Image downloaded—send it to Jas.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      showToast("Could not share. Try the text receipt instead.");
    }
  } finally {
    button.disabled = false;
    button.innerHTML = originalContent;
  }
}

function moveEvadeButton(button, pointerX, pointerY) {
  const now = performance.now();
  if (now - state.lastEscapeAt < 145) return;
  state.lastEscapeAt = now;

  state.dodges += 1;
  button.textContent = dodgeLines[state.dodges % dodgeLines.length];
  button.style.width = "auto";
  button.classList.add("escaped");

  const arena = document.querySelector(".booking-card");
  const arenaRect = arena.getBoundingClientRect();
  const currentRect = button.getBoundingClientRect();
  const viewportPadding = 8;
  const arenaPadding = 18;
  const availableWidth = Math.max(110, arenaRect.width - arenaPadding * 2);
  const width = Math.min(Math.max(currentRect.width, 110), availableWidth);
  const height = currentRect.height;
  const minX = Math.max(viewportPadding, arenaRect.left + arenaPadding);
  const minY = Math.max(viewportPadding, arenaRect.top + arenaPadding);
  const maxX = Math.max(
    minX,
    Math.min(
      window.innerWidth - width - viewportPadding,
      arenaRect.right - width - arenaPadding,
    ),
  );
  const maxY = Math.max(
    minY,
    Math.min(
      window.innerHeight - height - viewportPadding,
      arenaRect.bottom - height - arenaPadding,
    ),
  );
  let nextX = minX;
  let nextY = minY;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidateX = minX + Math.random() * Math.max(1, maxX - minX);
    const candidateY = minY + Math.random() * Math.max(1, maxY - minY);
    const centerX = candidateX + width / 2;
    const centerY = candidateY + height / 2;
    const distance = Math.hypot(centerX - pointerX, centerY - pointerY);
    nextX = candidateX;
    nextY = candidateY;
    if (distance > Math.min(230, window.innerWidth * 0.42)) break;
  }

  button.style.width = `${width}px`;
  button.style.left = `${Math.round(nextX)}px`;
  button.style.top = `${Math.round(nextY)}px`;
}

function triggerNoDodge(button, pointerX, pointerY) {
  moveEvadeButton(button, pointerX, pointerY);
}

function distanceToButton(x, y, button) {
  const rect = button.getBoundingClientRect();
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

function updateActivitySummary() {
  const count = state.selectedActivities.length;
  const counter = document.querySelector("#activityCount");
  const confirmButton = document.querySelector('[data-action="activities-confirm"]');
  counter.textContent = count === 0
    ? "Choose at least one adventure."
    : `${count} ${count === 1 ? "plan" : "plans"} selected. This is looking good.`;
  confirmButton.disabled = count === 0;
}

function toggleActivity(button) {
  const activity = button.dataset.activity;
  const selected = state.selectedActivities.includes(activity);

  if (selected) {
    state.selectedActivities = state.selectedActivities.filter((item) => item !== activity);
  } else {
    state.selectedActivities.push(activity);
  }

  button.setAttribute("aria-pressed", String(!selected));
  updateActivitySummary();
}

function addCustomActivities() {
  const input = document.querySelector("#customActivityInput");
  const grid = document.querySelector("#activityGrid");
  if (!input || !grid) return;

  const ideas = input.value
    .split(/[,\n]+/)
    .map((idea) => idea.trim().replace(/\s+/g, " "))
    .filter((idea) => idea.length >= 2)
    .map((idea) => idea.slice(0, 60));

  if (ideas.length === 0) {
    showToast("Type at least one idea first.");
    input.focus();
    return;
  }

  let added = 0;
  ideas.forEach((idea) => {
    const existing = [...grid.querySelectorAll("[data-activity]")]
      .find((button) => button.dataset.activity.toLowerCase() === idea.toLowerCase());

    if (existing) {
      if (!state.selectedActivities.includes(existing.dataset.activity)) {
        state.selectedActivities.push(existing.dataset.activity);
        existing.setAttribute("aria-pressed", "true");
      }
      return;
    }

    if (grid.querySelectorAll('[data-custom="true"]').length >= 20) return;

    const chip = document.createElement("button");
    chip.className = "activity-chip";
    chip.type = "button";
    chip.dataset.activity = idea;
    chip.dataset.custom = "true";
    chip.setAttribute("aria-pressed", "true");
    chip.textContent = idea;
    grid.appendChild(chip);
    state.selectedActivities.push(idea);
    added += 1;
  });

  input.value = "";
  updateActivitySummary();
  showToast(added > 0 ? `${added} custom ${added === 1 ? "idea" : "ideas"} added.` : "Those ideas are already available.");
  input.focus();
}

function reserveFutureSlot(button) {
  state.futureSlot = true;
  button.disabled = true;
  button.textContent = "Future pampering slot saved";
  const status = document.querySelector("#futureStatus");
  if (status) status.textContent = "Priority slot requested";
  sendTrackingEvent("booking_updated", { futureSlot: true });
  showToast("Future Jas access saved. Current booking stays confirmed.");
}

document.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const button = screen.querySelector(".evade-button");
  if (!button) return;
  if (distanceToButton(event.clientX, event.clientY, button) < 72) {
    triggerNoDodge(button, event.clientX, event.clientY);
  }
});

screen.addEventListener("pointerdown", (event) => {
  const button = event.target.closest(".evade-button");
  if (!button) return;
  event.preventDefault();
  triggerNoDodge(button, event.clientX, event.clientY);
});

screen.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.matches(".evade-button")) {
    event.preventDefault();
    triggerNoDodge(target, window.innerWidth / 2, window.innerHeight / 2);
    return;
  }

  if (target.dataset.activity) {
    toggleActivity(target);
    return;
  }

  if (target.dataset.smileChoice) {
    state.smileChoice = target.dataset.smileChoice;
    showConfirmation();
    return;
  }

  if (target.dataset.action === "review") showSeeJas();
  if (target.dataset.action === "start-tracked-booking") startTrackedBooking(target);
  if (target.dataset.action === "yes") showDayPicker();
  if (target.dataset.action === "confirm-three") showActivities(3);
  if (target.dataset.action === "activities-confirm") showSmileChoice();
  if (target.dataset.action === "copy") copyReceipt();
  if (target.dataset.action === "share-booking") shareBookingCard(target);
  if (target.dataset.action === "add-custom-activities") addCustomActivities();
  if (target.dataset.action === "restart") showIntro();
  if (target.dataset.action === "future-slot") reserveFutureSlot(target);

  if (target.dataset.days) {
    const choice = target.dataset.days;
    if (choice === "1" || choice === "2") showReaction(choice);
    else showActivities(choice === "lifetime" ? "lifetime" : Number(choice));
  }
});

screen.addEventListener("input", (event) => {
  if (event.target.matches("#visitorName, #trackingConsent")) updateStartButton();
});

screen.addEventListener("change", (event) => {
  if (event.target.matches("#visitorName, #trackingConsent")) updateStartButton();
});

screen.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("#customActivityInput")) {
    event.preventDefault();
    addCustomActivities();
  }
});

window.addEventListener("pagehide", () => {
  sendTrackingEvent("session_left", {
    lastStep: state.step,
    furthestStep: state.furthestStep,
    completed: state.submitted,
    timeOnPageSeconds: Math.max(0, Math.round((Date.now() - Date.parse(pageOpenedAt)) / 1000)),
  }, true);
});

showIntro();
