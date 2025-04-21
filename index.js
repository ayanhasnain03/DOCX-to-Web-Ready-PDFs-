require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { PDFNet } = require("@pdftron/pdfnet-node");
const mammoth = require("mammoth");
const libre = require("libreoffice-convert");
const cors = require("cors");

const app = express();
const port = 3001;

// Multer middleware to store uploaded files in memory
const upload = multer();

// CORS configuration (allow cross-origin requests from the frontend)
app.use(cors());

// Function for converting DOCX to PDF using PDFTron
async function convertDocxToPdf(fileBuffer) {
  return PDFNet.runWithCleanup(async () => {
    const pdfDoc = await PDFNet.PDFDoc.create();
    const memoryFilter = await PDFNet.Filter.createFromMemory(fileBuffer);
    const options = new PDFNet.Convert.ConversionOptions();

    const conversion =
      await PDFNet.Convert.streamingPdfConversionWithPdfAndFilter(
        pdfDoc,
        memoryFilter,
        options
      );

    while (
      (await conversion.getConversionStatus()) !==
      PDFNet.DocumentConversion.Result.e_Success
    ) {
      await conversion.convertNextPage();
    }

    const pdfBuffer = await pdfDoc.saveMemoryBuffer(
      PDFNet.SDFDoc.SaveOptions.e_linearized
    );
    return pdfBuffer;
  }, process.env.APRYSE_API_KEY); // Ensure API key from .env is passed for PDFTron
}

// Function for converting DOCX to HTML using Mammoth
async function convertDocxToHtml(fileBuffer) {
  const result = await mammoth.convertToHtml({ buffer: fileBuffer });
  return result.value;
}

// Function for converting files using LibreOffice (supports multiple formats)
async function convertWithLibre(fileBuffer, outputFormat = "pdf") {
  return new Promise((resolve, reject) => {
    libre.convert(fileBuffer, outputFormat, undefined, (err, convertedData) => {
      if (err) {
        reject(err);
      } else {
        resolve(convertedData);
      }
    });
  });
}

// Handle file upload and conversion based on requested format
app.post("/convert-file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { file } = req;
  const { format } = req.body; // Format to convert to (e.g., pdf, docx, html)

  try {
    let convertedFileBuffer;

    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      format === "pdf"
    ) {
      // Convert DOCX to PDF
      convertedFileBuffer = await convertDocxToPdf(file.buffer);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=converted.pdf",
      });
      res.send(convertedFileBuffer);
    } else if (file.mimetype === "application/pdf" && format === "docx") {
      // Convert PDF to DOCX (using LibreOffice)
      convertedFileBuffer = await convertWithLibre(file.buffer, "docx");
      res.set({
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment; filename=converted.docx",
      });
      res.send(convertedFileBuffer);
    } else if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      format === "html"
    ) {
      // Convert DOCX to HTML
      convertedFileBuffer = await convertDocxToHtml(file.buffer);
      res.set({
        "Content-Type": "text/html",
        "Content-Disposition": "attachment; filename=converted.html",
      });
      res.send(convertedFileBuffer);
    } else {
      res.status(400).json({ error: "Invalid file or format requested." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ error: "Conversion failed", details: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
