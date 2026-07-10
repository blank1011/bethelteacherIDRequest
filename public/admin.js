const body = document.getElementById("requests-body");
const refreshBtn = document.getElementById("refresh-btn");
const message = document.getElementById("admin-message");
const detailsPanel = document.getElementById("details-panel");

const summaryTotal = document.getElementById("summary-total");
const summaryPending = document.getElementById("summary-pending");
const summaryInProgress = document.getElementById("summary-inprogress");
const summaryFinished = document.getElementById("summary-finished");
const summaryStudent = document.getElementById("summary-student");

let requests = [];

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function typeLabel(item) {
  return item.requestType === "student" ? "Student" : "Teacher";
}

function statusValue(item) {
  if (item.status === "inprogress" || item.status === "finished" || item.status === "pending") {
    return item.status;
  }
  return item.finished ? "finished" : "pending";
}

function statusLabel(value) {
  if (value === "finished") return "Finished";
  if (value === "inprogress") return "In Progress";
  return "Pending";
}

function identifier(item) {
  return item.requestType === "student" ? item.studentNumber || item.lrn || "-" : item.employeeNumber || "-";
}

function guardianDisplay(item) {
  if (item.requestType === "student") {
    return [item.parentGuardian1, item.parentGuardian2].filter(Boolean).join(" / ") || "-";
  }
  return item.guardianName || "-";
}

function contactDisplay(item) {
  if (item.requestType === "student") {
    return [item.contactNumber1, item.contactNumber2].filter(Boolean).join(" / ") || "-";
  }
  return item.contactNumber || "-";
}

function imagePath(item) {
  return item.eSignaturePath || item.studentPhotoPath || "";
}

function renderSummary() {
  const total = requests.length;
  const pending = requests.filter((item) => statusValue(item) === "pending").length;
  const inProgress = requests.filter((item) => statusValue(item) === "inprogress").length;
  const finished = requests.filter((item) => statusValue(item) === "finished").length;
  const students = requests.filter((item) => item.requestType === "student").length;

  summaryTotal.textContent = String(total);
  summaryPending.textContent = String(pending);
  summaryInProgress.textContent = String(inProgress);
  summaryFinished.textContent = String(finished);
  summaryStudent.textContent = String(students);
}

function renderRows() {
  if (!requests.length) {
    body.innerHTML = '<tr><td colspan="8" class="muted">No requests yet.</td></tr>';
    return;
  }

  body.innerHTML = requests
    .map((item) => {
      const status = statusValue(item);
      const image = imagePath(item);
      const imageCell = image ? `<a href="${image}" target="_blank" rel="noreferrer">View</a>` : "-";

      return `
      <tr>
        <td>${escapeHtml(typeLabel(item))}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(identifier(item))}</td>
        <td>${escapeHtml(guardianDisplay(item))}</td>
        <td>${escapeHtml(contactDisplay(item))}</td>
        <td>
          <span class="badge ${status}">
            ${statusLabel(status)}
          </span>
        </td>
        <td>${imageCell}</td>
        <td>
          <div class="action-row">
            <button type="button" class="secondary" data-view="${item.id}">View Details</button>
            <select class="status-select" data-status-select="${item.id}">
              <option value="pending" ${status === "pending" ? "selected" : ""}>Pending</option>
              <option value="inprogress" ${status === "inprogress" ? "selected" : ""}>In Progress</option>
              <option value="finished" ${status === "finished" ? "selected" : ""}>Finished</option>
            </select>
            <button type="button" class="warn" data-apply-status="${item.id}">Update</button>
            <button type="button" class="danger" data-delete="${item.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

function detailItem(label, value) {
  return `
    <div class="details-item">
      <div class="details-key">${escapeHtml(label)}</div>
      <div class="details-value">${escapeHtml(value || "-")}</div>
    </div>
  `;
}

function renderDetails(item) {
  if (!item) {
    detailsPanel.className = "details-panel muted";
    detailsPanel.textContent = "No request selected.";
    return;
  }

  const image = imagePath(item);
  const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString() : "-";
  const updatedAt = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-";

  let fields = [
    detailItem("Type", typeLabel(item)),
    detailItem("Name", item.name),
    detailItem("Status", statusLabel(statusValue(item))),
    detailItem("Created", createdAt),
    detailItem("Updated", updatedAt),
  ];

  if (item.requestType === "student") {
    fields = fields.concat([
      detailItem("LRN", item.lrn),
      detailItem("Student Number", item.studentNumber),
      detailItem("Birthday", item.birthday),
      detailItem("Parent/Guardian 1", item.parentGuardian1),
      detailItem("Parent/Guardian 2", item.parentGuardian2),
      detailItem("Parents Address", item.parentsAddress),
      detailItem("Contact Number 1", item.contactNumber1),
      detailItem("Contact Number 2", item.contactNumber2),
    ]);
  } else {
    fields = fields.concat([
      detailItem("Employee Number", item.employeeNumber),
      detailItem("BIR TIN", item.birTin),
      detailItem("SSS No", item.sssNo),
      detailItem("Philhealth No", item.philhealthNo),
      detailItem("Pag-ibig No", item.pagibigNo),
      detailItem("Guardian Name", item.guardianName),
      detailItem("Guardian Address", item.guardianAddress),
      detailItem("Contact Number", item.contactNumber),
    ]);
  }

  if (image) {
    fields.push(
      `
      <div class="details-item">
        <div class="details-key">Image</div>
        <div class="details-value"><a href="${image}" target="_blank" rel="noreferrer">Open Uploaded Image</a></div>
      </div>
    `,
    );
  }

  detailsPanel.className = "details-panel";
  detailsPanel.innerHTML = `<div class="details-grid">${fields.join("")}</div>`;
}

async function loadRequests() {
  setMessage("Loading requests...");

  try {
    const response = await fetch("/api/requests");
    const result = await response.json();

    if (!response.ok) {
      setMessage("Failed to load requests.", "error");
      return;
    }

    requests = Array.isArray(result) ? result : [];
    renderRows();
    renderSummary();
    renderDetails(null);
    setMessage(`Loaded ${requests.length} request(s).`, "success");
  } catch (_error) {
    setMessage("Unable to load requests right now.", "error");
  }
}

body.addEventListener("click", async (event) => {
  const viewId = event.target.getAttribute("data-view");
  const applyStatusId = event.target.getAttribute("data-apply-status");
  const deleteId = event.target.getAttribute("data-delete");

  if (viewId) {
    const selected = requests.find((item) => item.id === viewId);
    if (!selected) return;
    renderDetails(selected);
    setMessage(`Viewing details for ${selected.name}.`, "success");
    return;
  }

  if (applyStatusId) {
    const selected = requests.find((item) => item.id === applyStatusId);
    if (!selected) return;

    const statusSelect = body.querySelector(`[data-status-select="${applyStatusId}"]`);
    const nextStatus = statusSelect ? statusSelect.value : "pending";

    try {
      const response = await fetch(`/api/requests/${applyStatusId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errors = Array.isArray(result.errors) ? result.errors.join(" ") : "Update failed.";
        setMessage(errors, "error");
        return;
      }

      setMessage(`Status updated to ${statusLabel(nextStatus)}.`, "success");
      await loadRequests();
    } catch (_error) {
      setMessage("Failed to update status.", "error");
    }
    return;
  }

  if (deleteId) {
    const selected = requests.find((item) => item.id === deleteId);
    if (!selected) return;

    const confirmed = window.confirm(`Delete request for ${selected.name}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/requests/${deleteId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        const errors = Array.isArray(result.errors) ? result.errors.join(" ") : result.message || "Delete failed.";
        setMessage(errors, "error");
        return;
      }

      setMessage("Request deleted.", "success");
      await loadRequests();
    } catch (_error) {
      setMessage("Failed to delete request.", "error");
    }
  }
});

refreshBtn.addEventListener("click", () => {
  loadRequests();
});

loadRequests();
