const express = require("express");
const fsNative = require("fs");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const writableBaseDir = isServerlessRuntime ? path.join("/tmp", "id-system") : __dirname;

const dataDir = path.join(writableBaseDir, "data");
const uploadsDir = path.join(writableBaseDir, "uploads");
const requestsFile = path.join(dataDir, "requests.json");
const validStatuses = new Set(["pending", "inprogress", "finished"]);

const allowedImageTypes = new Set(["image/png", "image/jpeg"]);
const patterns = {
  birTin: /^\d{3}-\d{3}-\d{3}$/,
  sssNo: /^\d{2}-\d{7}-\d$/,
  philhealthNo: /^\d{2}-\d{9}-\d$/,
  pagibigNo: /^\d{4}-\d{4}-\d{4}$/,
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fsNative.mkdir(uploadsDir, { recursive: true }, (err) => {
      cb(err, uploadsDir);
    });
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext === ".png" || ext === ".jpg" || ext === ".jpeg" ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      cb(new Error("Only PNG or JPG files are allowed for image uploads."));
      return;
    }
    cb(null, true);
  },
});

const uploadRequestImages = upload.fields([
  { name: "eSignature", maxCount: 1 },
  { name: "studentPhoto", maxCount: 1 },
]);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "teacher.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  const candidate = normalizeText(value).toLowerCase();
  return validStatuses.has(candidate) ? candidate : "";
}

function resolveRequestStatus(record) {
  const explicitStatus = normalizeStatus(record?.status);
  if (explicitStatus) return explicitStatus;
  return record?.finished ? "finished" : "pending";
}

function validateOptionalPattern(value, pattern, label) {
  if (!value) return null;
  if (!pattern.test(value)) return `${label} format is invalid.`;
  return null;
}

function validateTeacherFields(fields) {
  const errors = [];

  if (!fields.name) errors.push("Name is required.");
  if (!fields.employeeNumber) errors.push("Employee Number is required.");
  if (!fields.guardianName) errors.push("Guardian Name is required.");
  if (!fields.guardianAddress) errors.push("Guardian Address is required.");
  if (!fields.contactNumber) errors.push("Contact Number is required.");

  const patternChecks = [
    validateOptionalPattern(fields.birTin, patterns.birTin, "BIR TIN"),
    validateOptionalPattern(fields.sssNo, patterns.sssNo, "SSS No"),
    validateOptionalPattern(fields.philhealthNo, patterns.philhealthNo, "Philhealth No"),
    validateOptionalPattern(fields.pagibigNo, patterns.pagibigNo, "Pag-ibig No"),
  ].filter(Boolean);

  errors.push(...patternChecks);
  return errors;
}

function validateStudentFields(fields) {
  const errors = [];

  if (!fields.name) errors.push("Name is required.");

  return errors;
}

async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
  try {
    await fs.access(requestsFile);
  } catch {
    await fs.writeFile(requestsFile, "[]\n", "utf8");
  }
}

async function readRequests() {
  await ensureStorage();
  const raw = await fs.readFile(requestsFile, "utf8");
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRequests(data) {
  await fs.writeFile(requestsFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function uploadPathToFilename(storedPath) {
  const normalized = normalizeText(storedPath);
  if (!normalized.startsWith("/uploads/")) return "";
  return path.basename(normalized);
}

async function removeUploadByStoredPath(storedPath) {
  const filename = uploadPathToFilename(storedPath);
  if (!filename) return;

  const absoluteFilePath = path.join(uploadsDir, filename);
  try {
    await fs.unlink(absoluteFilePath);
  } catch {
    // Ignore missing file errors and keep request flow successful.
  }
}

async function removeUploadedFiles(files) {
  if (!files || typeof files !== "object") return;

  const fileEntries = Object.values(files).flat();
  for (const file of fileEntries) {
    if (!file || !file.filename) continue;
    const absoluteFilePath = path.join(uploadsDir, file.filename);
    try {
      await fs.unlink(absoluteFilePath);
    } catch {
      // Ignore missing file errors and keep request flow successful.
    }
  }
}

async function cleanupOrphanUploadFiles() {
  const list = await readRequests();
  const referencedFilenames = new Set();

  for (const item of list) {
    const signatureName = uploadPathToFilename(item.eSignaturePath);
    const photoName = uploadPathToFilename(item.studentPhotoPath);
    if (signatureName) referencedFilenames.add(signatureName);
    if (photoName) referencedFilenames.add(photoName);
  }

  let filesInUploads = [];
  try {
    filesInUploads = await fs.readdir(uploadsDir);
  } catch {
    return;
  }
  for (const filename of filesInUploads) {
    if (referencedFilenames.has(filename)) continue;

    const absoluteFilePath = path.join(uploadsDir, filename);
    try {
      await fs.unlink(absoluteFilePath);
    } catch {
      // Ignore files that cannot be removed.
    }
  }
}

app.get("/api/requests", async (_req, res) => {
  const list = await readRequests();
  const normalized = list.map((item) => ({
    ...item,
    status: resolveRequestStatus(item),
    finished: resolveRequestStatus(item) === "finished",
  }));
  normalized.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(normalized);
});

app.get("/api/requests/:id/status", async (req, res) => {
  const list = await readRequests();
  const found = list.find((item) => item.id === req.params.id);

  if (!found) {
    res.status(404).json({ message: "Request not found." });
    return;
  }

  const status = resolveRequestStatus(found);
  res.json({
    id: found.id,
    name: found.name,
    requestType: found.requestType || "teacher",
    status,
    createdAt: found.createdAt,
    updatedAt: found.updatedAt,
  });
});

app.post("/api/requests", uploadRequestImages, async (req, res) => {
  const requestType = normalizeText(req.body.requestType).toLowerCase() || "teacher";

  if (!["teacher", "student"].includes(requestType)) {
    res.status(400).json({ errors: ["Invalid request type."] });
    return;
  }

  const teacherFields = {
    name: normalizeText(req.body.name),
    employeeNumber: normalizeText(req.body.employeeNumber),
    birTin: normalizeText(req.body.birTin),
    sssNo: normalizeText(req.body.sssNo),
    philhealthNo: normalizeText(req.body.philhealthNo),
    pagibigNo: normalizeText(req.body.pagibigNo),
    guardianName: normalizeText(req.body.guardianName),
    guardianAddress: normalizeText(req.body.guardianAddress),
    contactNumber: normalizeText(req.body.contactNumber),
  };

  const studentFields = {
    name: normalizeText(req.body.name),
    lrn: normalizeText(req.body.lrn),
    studentNumber: normalizeText(req.body.studentNumber),
    birthday: normalizeText(req.body.birthday),
    parentGuardian1: normalizeText(req.body.parentGuardian1),
    parentGuardian2: normalizeText(req.body.parentGuardian2),
    parentsAddress: normalizeText(req.body.parentsAddress),
    contactNumber1: normalizeText(req.body.contactNumber1),
    contactNumber2: normalizeText(req.body.contactNumber2),
  };

  const errors = requestType === "teacher" ? validateTeacherFields(teacherFields) : validateStudentFields(studentFields);

  const eSignatureFile = req.files?.eSignature?.[0];
  const studentPhotoFile = req.files?.studentPhoto?.[0];

  if (requestType === "teacher" && !eSignatureFile) {
    errors.push("E-signature image is required.");
  }

  if (errors.length) {
    await removeUploadedFiles(req.files);
    res.status(400).json({ errors });
    return;
  }

  const now = new Date().toISOString();
  const baseRecord = {
    id: `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    requestType,
    name: requestType === "teacher" ? teacherFields.name : studentFields.name,
    status: "pending",
    finished: false,
    createdAt: now,
    updatedAt: now,
  };

  const record =
    requestType === "teacher"
      ? {
          ...baseRecord,
          ...teacherFields,
          eSignaturePath: `/uploads/${eSignatureFile.filename}`,
          studentPhotoPath: "",
        }
      : {
          ...baseRecord,
          ...studentFields,
          eSignaturePath: "",
          studentPhotoPath: studentPhotoFile ? `/uploads/${studentPhotoFile.filename}` : "",
        };

  const list = await readRequests();
  list.push(record);
  await writeRequests(list);

  res.status(201).json({ message: "Request submitted successfully.", request: record });
});

app.patch("/api/requests/:id", async (req, res) => {
  const list = await readRequests();
  const index = list.findIndex((item) => item.id === req.params.id);

  if (index < 0) {
    res.status(404).json({ message: "Request not found." });
    return;
  }

  const current = list[index];
  const currentStatus = resolveRequestStatus(current);
  const requestedStatus = normalizeStatus(req.body.status);
  const legacyFinished = req.body.finished;
  const nextStatus =
    requestedStatus ||
    (legacyFinished !== undefined ? (Boolean(legacyFinished) ? "finished" : "pending") : currentStatus);

  const requestType = current.requestType || "teacher";
  let next;
  let errors;

  if (requestType === "student") {
    next = {
      ...current,
      requestType: "student",
      name: req.body.name !== undefined ? normalizeText(req.body.name) : current.name,
      lrn: req.body.lrn !== undefined ? normalizeText(req.body.lrn) : current.lrn,
      studentNumber:
        req.body.studentNumber !== undefined
          ? normalizeText(req.body.studentNumber)
          : req.body.employeeNumber !== undefined
            ? normalizeText(req.body.employeeNumber)
            : current.studentNumber,
      birthday: req.body.birthday !== undefined ? normalizeText(req.body.birthday) : current.birthday,
      parentGuardian1:
        req.body.parentGuardian1 !== undefined
          ? normalizeText(req.body.parentGuardian1)
          : req.body.guardianName !== undefined
            ? normalizeText(req.body.guardianName)
            : current.parentGuardian1,
      parentGuardian2: req.body.parentGuardian2 !== undefined ? normalizeText(req.body.parentGuardian2) : current.parentGuardian2,
      parentsAddress:
        req.body.parentsAddress !== undefined
          ? normalizeText(req.body.parentsAddress)
          : req.body.guardianAddress !== undefined
            ? normalizeText(req.body.guardianAddress)
            : current.parentsAddress,
      contactNumber1:
        req.body.contactNumber1 !== undefined
          ? normalizeText(req.body.contactNumber1)
          : req.body.contactNumber !== undefined
            ? normalizeText(req.body.contactNumber)
            : current.contactNumber1,
      contactNumber2: req.body.contactNumber2 !== undefined ? normalizeText(req.body.contactNumber2) : current.contactNumber2,
      status: nextStatus,
      finished: nextStatus === "finished",
      updatedAt: new Date().toISOString(),
    };
    errors = validateStudentFields(next);
  } else {
    next = {
      ...current,
      requestType: "teacher",
      name: req.body.name !== undefined ? normalizeText(req.body.name) : current.name,
      employeeNumber: req.body.employeeNumber !== undefined ? normalizeText(req.body.employeeNumber) : current.employeeNumber,
      birTin: req.body.birTin !== undefined ? normalizeText(req.body.birTin) : current.birTin,
      sssNo: req.body.sssNo !== undefined ? normalizeText(req.body.sssNo) : current.sssNo,
      philhealthNo: req.body.philhealthNo !== undefined ? normalizeText(req.body.philhealthNo) : current.philhealthNo,
      pagibigNo: req.body.pagibigNo !== undefined ? normalizeText(req.body.pagibigNo) : current.pagibigNo,
      guardianName: req.body.guardianName !== undefined ? normalizeText(req.body.guardianName) : current.guardianName,
      guardianAddress: req.body.guardianAddress !== undefined ? normalizeText(req.body.guardianAddress) : current.guardianAddress,
      contactNumber: req.body.contactNumber !== undefined ? normalizeText(req.body.contactNumber) : current.contactNumber,
      status: nextStatus,
      finished: nextStatus === "finished",
      updatedAt: new Date().toISOString(),
    };
    errors = validateTeacherFields(next);
  }

  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }

  list[index] = next;
  await writeRequests(list);
  res.json({ message: "Request updated.", request: next });
});

app.delete("/api/requests/:id", async (req, res) => {
  const list = await readRequests();
  const index = list.findIndex((item) => item.id === req.params.id);

  if (index < 0) {
    res.status(404).json({ message: "Request not found." });
    return;
  }

  const [removed] = list.splice(index, 1);
  await writeRequests(list);

  const cleanupPaths = [normalizeText(removed.eSignaturePath), normalizeText(removed.studentPhotoPath)].filter(Boolean);
  for (const storedPath of cleanupPaths) {
    await removeUploadByStoredPath(storedPath);
  }

  await cleanupOrphanUploadFiles();

  res.json({ message: "Request deleted.", request: removed });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ errors: [err.message] });
    return;
  }

  if (err) {
    res.status(400).json({ errors: [err.message || "Unexpected error."] });
    return;
  }

  res.status(500).json({ errors: ["Internal server error."] });
});

if (isServerlessRuntime) {
  ensureStorage().then(cleanupOrphanUploadFiles).catch((error) => {
    console.error("Serverless bootstrap warning:", error);
  });
} else {
  ensureStorage()
    .then(async () => {
      await cleanupOrphanUploadFiles();
      app.listen(PORT, () => {
        console.log(`ID system running at http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Failed to start server:", error);
      process.exit(1);
    });
}

module.exports = app;
