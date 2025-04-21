require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { PDFNet } = require("@pdftron/pdfnet-node");
const cors = require("cors");

const app = express();
const port = 3001;

// Step 0: Multer middleware init
const upload = multer(); // Store file in memory, no temporary disk storage

// Step 0: CORS setup here
// ...

// Conversion function for DOCX to PDF
async function convertDocxToPdfFromMemory(fileBuffer) {
  return PDFNet.runWithCleanup(async () => {
    // Step 1: Create PDFDoc container for final PDF
    const pdfdoc = await PDFNet.PDFDoc.create();

    // Step 2: Create a memory filter from the uploaded file buffer
    const memoryFilter = await PDFNet.Filter.createFromMemory(fileBuffer);

    // Step 3: Customize with options object as needed
    const options = new PDFNet.Convert.ConversionOptions();

    // Step 4: Initialize the streaming conversion object
    const conversion =
      await PDFNet.Convert.streamingPdfConversionWithPdfAndFilter(
        pdfdoc, // Target PDFDoc
        memoryFilter, // Source Filter (from file buffer)
        options // Conversion options
      );

    // Step 5: Actual conversion progress loop
    while (
      (await conversion.getConversionStatus()) !==
      PDFNet.DocumentConversion.Result.e_Success
    ) {
      await conversion.convertNextPage(); // Process each page
      console.log(
        `Progress: ${Math.round(
          (await conversion.getProgress()) * 100
        )}% - ${await conversion.getProgressLabel()}`
      );
    }

    console.log("Conversion complete. Saving PDF...");
    const pdfBuffer = await pdfdoc.saveMemoryBuffer(
      PDFNet.SDFDoc.SaveOptions.e_linearized
    );
    console.log("PDF saved to memory buffer.");
    return pdfBuffer; // Return the buffer containing the converted PDF
  }, process.env.APRYSE_API_KEY); // Ensure API key is passed
}

// Finally: POST route for file upload and conversion
app.post("/convert-to-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  try {
    // Convert DOCX file buffer to PDF buffer
    const pdfBuffer = await convertDocxToPdfFromMemory(req.file.buffer);

    // Send the converted PDF back with appropriate headers
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=converted.pdf",
    }); // This'll trigger a PDF file download for the client

    res.send(pdfBuffer); // Send the PDF buffer as response
  } catch (error) {
    res.status(500).json({ error: "Conversion failed." });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
