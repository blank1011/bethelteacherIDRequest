const teacherForm = document.getElementById("teacher-form");
const studentForm = document.getElementById("student-form");
const teacherMessage = document.getElementById("teacher-message");
const studentMessage = document.getElementById("student-message");
const statusForm = document.getElementById("status-form");
const statusMessage = document.getElementById("status-message");
const statusResult = document.getElementById("status-result");
const navButtons = document.querySelectorAll(".request-nav-btn");
const requestPanels = document.querySelectorAll(".request-panel");
const successModal = document.getElementById("success-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const modalCopy = document.getElementById("modal-copy");

function statusLabel(status) {
  if (status === "finished") return "Finished";
  if (status === "inprogress") return "In Progress";
  return "Pending";
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function applyGroupedMask(value, groups) {
  const digits = digitsOnly(value);
  const parts = [];
  let index = 0;

  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }

  return parts.join("-");
}

function bindAutoDash(form, inputName, groups) {
  if (!form) return;
  const input = form.elements[inputName];
  if (!input) return;

  const updateValue = () => {
    input.value = applyGroupedMask(input.value, groups);
  };

  input.addEventListener("input", updateValue);
  input.addEventListener("blur", updateValue);
}

function setMessage(target, text, type = "") {
  if (!target) return;
  target.textContent = text;
  target.className = `message ${type}`.trim();
}

function openSuccessModal() {
  if (!successModal) return;
  successModal.hidden = false;
}

function closeSuccessModal() {
  if (!successModal) return;
  successModal.hidden = true;
}

function switchPanel(targetId) {
  requestPanels.forEach((panel) => {
    const active = panel.id === targetId;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });

  navButtons.forEach((button) => {
    const active = button.getAttribute("data-target") === targetId;
    button.classList.toggle("active", active);
  });
}

async function submitRequest(form, targetMessage, requestType) {
  setMessage(targetMessage, "Submitting request...");

  const formData = new FormData(form);
  formData.set("requestType", requestType);

  try {
    const response = await fetch("/api/requests", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      const errors = Array.isArray(result.errors) ? result.errors.join(" ") : "Submission failed.";
      setMessage(targetMessage, errors, "error");
      return;
    }

    const requestId = result?.request?.id || "";
    form.reset();
    setMessage(targetMessage, `Request submitted successfully. Request ID: ${requestId}`, "success");
    if (modalCopy) {
      modalCopy.textContent = `Your ID request was submitted successfully. Request ID: ${requestId}`;
    }
    openSuccessModal();
  } catch (_error) {
    setMessage(targetMessage, "Unable to submit right now. Please try again.", "error");
  }
}

function renderStatusResult(result) {
  if (!statusResult) return;

  if (!result) {
    statusResult.className = "details-panel muted";
    statusResult.textContent = "No status checked yet.";
    return;
  }

  const requestType = result.requestType === "student" ? "Student" : "Teacher";
  const label = statusLabel(result.status);
  const updatedAt = result.updatedAt ? new Date(result.updatedAt).toLocaleString() : "-";

  statusResult.className = "details-panel";
  statusResult.innerHTML = `
    <div class="details-grid">
      <div class="details-item">
        <div class="details-key">Request ID</div>
        <div class="details-value">${result.id}</div>
      </div>
      <div class="details-item">
        <div class="details-key">Type</div>
        <div class="details-value">${requestType}</div>
      </div>
      <div class="details-item">
        <div class="details-key">Name</div>
        <div class="details-value">${result.name || "-"}</div>
      </div>
      <div class="details-item">
        <div class="details-key">Status</div>
        <div class="details-value"><span class="badge ${result.status}">${label}</span></div>
      </div>
      <div class="details-item">
        <div class="details-key">Last Updated</div>
        <div class="details-value">${updatedAt}</div>
      </div>
    </div>
  `;
}

if (teacherForm) {
  teacherForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitRequest(teacherForm, teacherMessage, "teacher");
  });

  bindAutoDash(teacherForm, "birTin", [3, 3, 3]);
  bindAutoDash(teacherForm, "sssNo", [2, 7, 1]);
  bindAutoDash(teacherForm, "philhealthNo", [2, 9, 1]);
  bindAutoDash(teacherForm, "pagibigNo", [4, 4, 4]);
}

if (studentForm) {
  studentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitRequest(studentForm, studentMessage, "student");
  });
}

if (statusForm) {
  statusForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const requestId = String(statusForm.elements.requestId.value || "").trim();

    if (!requestId) {
      setMessage(statusMessage, "Request ID is required.", "error");
      renderStatusResult(null);
      return;
    }

    setMessage(statusMessage, "Checking status...");

    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/status`);
      const result = await response.json();

      if (!response.ok) {
        setMessage(statusMessage, result.message || "Request not found.", "error");
        renderStatusResult(null);
        return;
      }

      setMessage(statusMessage, "Status loaded.", "success");
      renderStatusResult(result);
    } catch (_error) {
      setMessage(statusMessage, "Unable to check status right now.", "error");
      renderStatusResult(null);
    }
  });
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.getAttribute("data-target");
    if (target) switchPanel(target);
  });
});

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    closeSuccessModal();
  });
}

if (successModal) {
  successModal.addEventListener("click", (event) => {
    if (event.target === successModal) {
      closeSuccessModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && successModal && !successModal.hidden) {
    closeSuccessModal();
  }
});

switchPanel("teacher-panel");
renderStatusResult(null);
