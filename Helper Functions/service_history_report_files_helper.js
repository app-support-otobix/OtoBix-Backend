'use strict';

const axios = require('axios');
const path = require('path');
const { URL } = require('url');
const { Readable } = require('stream');
const mongoose = require('mongoose');
const { chromium } = require('playwright');

const cloudinary = require('../Config/cloudinary');
const ServiceHistoryReportsModel = require('../Models/serviceHistoryReportsModel');

const CLOUDINARY_PARENT_FOLDER = process.env.CLOUDINARY_PARENT_FOLDER || 'OtoBix';
const SERVICE_HISTORY_FOLDER = 'Service History/Files';

let sharedBrowserPromise = null;
let browserCleanupAttached = false;

function sanitizePathPart(value = '') {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function buildCloudinaryFolder(registrationNumber = '') {
  const safeRegistrationNumber = sanitizePathPart(registrationNumber || 'unknown_vehicle');
  return `${CLOUDINARY_PARENT_FOLDER}/${SERVICE_HISTORY_FOLDER}/${safeRegistrationNumber}`;
}

function toAbsoluteUrl(baseUrl, maybeRelativeUrl = '') {
  try {
    if (!maybeRelativeUrl) return '';
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch (error) {
    return maybeRelativeUrl || '';
  }
}

function extractUrlFromOnclick(onclick = '', baseUrl = '') {
  if (!onclick) return '';

  const patterns = [
    /window\.open\(['"`]([^'"`]+)['"`]/i,
    /location\.href\s*=\s*['"`]([^'"`]+)['"`]/i,
    /window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/i,
    /document\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/i,
    /['"`]([^'"`]+\.(pdf|xlsx|xls|csv|zip))['"`]/i
  ];

  for (const pattern of patterns) {
    const match = onclick.match(pattern);
    if (match && match[1]) {
      return toAbsoluteUrl(baseUrl, match[1]);
    }
  }

  return '';
}

function extractFilenameFromHeaders(headers = {}, fallbackName = 'file') {
  const contentDisposition = headers['content-disposition'] || '';

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const normalMatch = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);

  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (error) {
      return utf8Match[1];
    }
  }

  if (normalMatch && normalMatch[1]) {
    return normalMatch[1];
  }

  return fallbackName;
}

function getExtensionFromContentType(contentType = '') {
  const value = String(contentType).toLowerCase();

  if (value.includes('application/pdf')) return '.pdf';
  if (value.includes('spreadsheetml')) return '.xlsx';
  if (value.includes('ms-excel')) return '.xls';
  if (value.includes('text/csv')) return '.csv';
  if (value.includes('application/zip')) return '.zip';
  if (value.includes('application/octet-stream')) return '';

  return '';
}

function guessFileTypeByUrl(url = '') {
  const lower = String(url).toLowerCase();

  if (lower.includes('.pdf')) return 'pdf';
  if (lower.includes('.xlsx') || lower.includes('.xls') || lower.includes('.csv')) return 'xlsx';
  if (lower.includes('.zip')) return 'xlsx';

  return '';
}

function isPdfBuffer(buffer, contentType = '') {
  return (
    String(contentType).toLowerCase().includes('application/pdf') ||
    buffer.slice(0, 4).toString() === '%PDF'
  );
}

function isSpreadsheetLikeBuffer(buffer, contentType = '', fileName = '') {
  const lowerContentType = String(contentType).toLowerCase();
  const lowerFileName = String(fileName).toLowerCase();

  if (
    lowerContentType.includes('spreadsheetml') ||
    lowerContentType.includes('ms-excel') ||
    lowerContentType.includes('text/csv') ||
    lowerContentType.includes('application/zip')
  ) {
    return true;
  }

  if (
    lowerFileName.endsWith('.xlsx') ||
    lowerFileName.endsWith('.xls') ||
    lowerFileName.endsWith('.csv') ||
    lowerFileName.endsWith('.zip')
  ) {
    return true;
  }

  return buffer.slice(0, 2).toString('hex') === '504b';
}

function buildAxiosProxyConfig() {
  const host = process.env.SERVICE_HISTORY_PROXY_HOST;
  const port = process.env.SERVICE_HISTORY_PROXY_PORT;
  const protocol = process.env.SERVICE_HISTORY_PROXY_PROTOCOL || 'http';

  if (!host || !port) {
    return null;
  }

  const proxy = {
    protocol,
    host,
    port: Number(port)
  };

  if (process.env.SERVICE_HISTORY_PROXY_USERNAME) {
    proxy.auth = {
      username: process.env.SERVICE_HISTORY_PROXY_USERNAME,
      password: process.env.SERVICE_HISTORY_PROXY_PASSWORD || ''
    };
  }

  return proxy;
}

function buildPlaywrightLaunchOptions() {
  const host = process.env.SERVICE_HISTORY_PROXY_HOST;
  const port = process.env.SERVICE_HISTORY_PROXY_PORT;
  const protocol = process.env.SERVICE_HISTORY_PROXY_PROTOCOL || 'http';

  const options = {
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  };

  if (host && port) {
    options.proxy = {
      server: `${protocol}://${host}:${port}`
    };

    if (process.env.SERVICE_HISTORY_PROXY_USERNAME) {
      options.proxy.username = process.env.SERVICE_HISTORY_PROXY_USERNAME;
      options.proxy.password = process.env.SERVICE_HISTORY_PROXY_PASSWORD || '';
    }
  }

  return options;
}

function attachBrowserCleanup() {
  if (browserCleanupAttached) return;
  browserCleanupAttached = true;

  const cleanup = async () => {
    if (!sharedBrowserPromise) return;

    try {
      const browser = await sharedBrowserPromise;
      await browser.close();
    } catch (error) {
      // ignore
    } finally {
      sharedBrowserPromise = null;
    }
  };

  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('beforeExit', cleanup);
}

async function getSharedBrowser() {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = chromium.launch(buildPlaywrightLaunchOptions());
    attachBrowserCleanup();
  }

  return sharedBrowserPromise;
}

function createHttpClient() {
  const proxy = buildAxiosProxyConfig();

  return axios.create({
    timeout: 60000,
    maxRedirects: 5,
    ...(proxy ? { proxy } : {}),
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-IN,en;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
}

function serializeCookies(cookies = []) {
  return cookies
    .filter((cookie) => cookie && cookie.name)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function buildCookieHeaderForUrl(context, targetUrl) {
  try {
    const cookies = await context.cookies(targetUrl);
    return serializeCookies(cookies);
  } catch (error) {
    return '';
  }
}

async function extractXlsxUrlFromPage(page) {
  const domResult = await page.evaluate(() => {
    const makeAbsolute = (rawUrl) => {
      try {
        return new URL(rawUrl, window.location.href).toString();
      } catch (error) {
        return rawUrl || '';
      }
    };

    const extractOnclickUrl = (onclick = '') => {
      if (!onclick) return '';

      const patterns = [
        /window\.open\(['"`]([^'"`]+)['"`]/i,
        /location\.href\s*=\s*['"`]([^'"`]+)['"`]/i,
        /window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/i,
        /document\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/i,
        /['"`]([^'"`]+\.(pdf|xlsx|xls|csv|zip))['"`]/i
      ];

      for (const pattern of patterns) {
        const match = onclick.match(pattern);
        if (match && match[1]) {
          return makeAbsolute(match[1]);
        }
      }

      return '';
    };

    let xlsxUrl = '';

    const nodes = Array.from(
      document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')
    );

    for (const node of nodes) {
      const text = `${node.textContent || ''} ${node.getAttribute('value') || ''} ${node.getAttribute('title') || ''}`
        .trim()
        .toLowerCase();

      const href = node.getAttribute('href') || '';
      const formaction = node.getAttribute('formaction') || '';
      const dataHref = node.getAttribute('data-href') || '';
      const dataUrl = node.getAttribute('data-url') || '';
      const onclick = node.getAttribute('onclick') || '';
      const parentAnchorHref = node.closest('a')?.getAttribute('href') || '';
      const parentFormAction = node.closest('form')?.getAttribute('action') || '';
      const onclickUrl = extractOnclickUrl(onclick);

      const rawUrl =
        onclickUrl ||
        dataHref ||
        dataUrl ||
        href ||
        formaction ||
        parentAnchorHref ||
        parentFormAction;

      if (!rawUrl) continue;

      if (/download the files|download files|xlsx|xls|excel|csv|zip/.test(text)) {
        xlsxUrl = makeAbsolute(rawUrl);
        break;
      }
    }

    if (!xlsxUrl) {
      const anchors = Array.from(document.querySelectorAll('a[href]'));

      for (const anchor of anchors) {
        const href = anchor.getAttribute('href') || '';
        const fullUrl = makeAbsolute(href);
        const lower = String(fullUrl).toLowerCase();

        if (
          lower.includes('.xlsx') ||
          lower.includes('.xls') ||
          lower.includes('.csv') ||
          lower.includes('.zip')
        ) {
          xlsxUrl = fullUrl;
          break;
        }
      }
    }

    return { xlsxUrl };
  });

  if (domResult.xlsxUrl) {
    return domResult.xlsxUrl;
  }

  const html = await page.content();
  const directMatches = html.match(/https?:\/\/[^\s"'<>]+/gi) || [];

  for (const item of directMatches) {
    const type = guessFileTypeByUrl(item);
    if (type === 'xlsx') {
      return item;
    }
  }

  return '';
}

async function openReportPage(reportPageUrl) {
  const browser = await getSharedBrowser();

  const context = await browser.newContext({
    viewport: { width: 1440, height: 2200 },
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0'
  });

  const page = await context.newPage();

  await page.goto(reportPageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });

  await page.waitForSelector('body', { timeout: 15000 });
  await page.waitForSelector('#divNewMain', { timeout: 15000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => null);
  await page.waitForTimeout(300);

  return { context, page };
}

async function generatePdfFromOpenPage(page, reportPageUrl, fallbackFileName) {
  await page.addStyleTag({
    content: `
      #btnNewPrint,
      a[href*="api.whatsapp.com"],
      a[href*="wa.me"],
      img[src*="whatsapp.png"] {
        display: none !important;
        visibility: hidden !important;
      }

      .otobix-logo-center-parent {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        flex-wrap: wrap !important;
      }

      .otobix-logo-center-target {
        width: 100% !important;
        max-width: 100% !important;
        flex: 0 0 100% !important;
        text-align: center !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      .otobix-logo-center-target img {
        display: block !important;
        margin-left: auto !important;
        margin-right: auto !important;
        max-width: 100% !important;
        height: auto !important;
      }

      @media print {
        #btnNewPrint,
        a[href*="api.whatsapp.com"],
        a[href*="wa.me"],
        img[src*="whatsapp.png"] {
          display: none !important;
          visibility: hidden !important;
        }
      }
    `
  });

  await page.evaluate(() => {
    document.querySelectorAll('a[href*="api.whatsapp.com"], a[href*="wa.me"]').forEach((el) => {
      el.remove();
    });

    document.querySelectorAll('img[src*="whatsapp.png"]').forEach((img) => {
      const anchor = img.closest('a');
      if (anchor) {
        anchor.remove();
      } else {
        img.remove();
      }
    });

    const downloadButton = document.querySelector('#btnNewPrint');
    if (!downloadButton) return;

    const buttonColumn =
      downloadButton.closest('.col-6') ||
      downloadButton.closest('[class*="col-"]') ||
      downloadButton.parentElement;

    const headerRow = buttonColumn ? buttonColumn.parentElement : null;

    let companyLogoColumn = null;

    if (headerRow) {
      const siblingColumns = Array.from(headerRow.children).filter((el) => el !== buttonColumn);

      companyLogoColumn = siblingColumns.find((el) => {
        const img = el.querySelector('img');
        if (!img) return false;

        const src = (img.getAttribute('src') || '').toLowerCase();
        const alt = (img.getAttribute('alt') || '').toLowerCase();

        return (
          src.includes('companylogos') ||
          alt.includes('carvaidya logo') ||
          alt.includes('logo')
        );
      }) || null;
    }

    if (buttonColumn) {
      buttonColumn.remove();
    } else {
      downloadButton.remove();
    }

    if (headerRow && companyLogoColumn) {
      headerRow.classList.add('otobix-logo-center-parent');
      companyLogoColumn.classList.add('otobix-logo-center-target');

      const logoImg = companyLogoColumn.querySelector('img');
      if (logoImg) {
        logoImg.style.display = 'block';
        logoImg.style.marginLeft = 'auto';
        logoImg.style.marginRight = 'auto';
      }
    }
  });

  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(200);

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '10mm',
      right: '8mm',
      bottom: '10mm',
      left: '8mm'
    }
  });

  if (!isPdfBuffer(pdfBuffer, 'application/pdf')) {
    throw new Error('Generated PDF buffer is invalid.');
  }

  return {
    buffer: pdfBuffer,
    contentType: 'application/pdf',
    fileName: path.extname(fallbackFileName) ? fallbackFileName : `${fallbackFileName}.pdf`,
    sourceUrl: reportPageUrl
  };
}

async function downloadFile(client, fileUrl, referer, fallbackName, expectedType = '', cookieHeader = '') {
  const response = await client.get(fileUrl, {
    responseType: 'arraybuffer',
    validateStatus: () => true,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': referer || '',
      'Origin': referer ? new URL(referer).origin : undefined,
      'Accept': '*/*',
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    }
  });

  const buffer = Buffer.from(response.data);
  const contentType = response.headers['content-type'] || '';
  let fileName = extractFilenameFromHeaders(response.headers, fallbackName);

  if (response.status >= 400) {
    const preview = buffer.toString('utf8', 0, 300);
    throw new Error(
      `Download failed. status=${response.status}, content-type=${contentType}, body=${preview}`
    );
  }

  if (!path.extname(fileName)) {
    const extFromContentType = getExtensionFromContentType(contentType);

    if (extFromContentType) {
      fileName = `${path.parse(fileName).name}${extFromContentType}`;
    } else {
      try {
        const pathname = new URL(fileUrl).pathname;
        const extFromUrl = path.extname(pathname);

        if (extFromUrl) {
          fileName = `${path.parse(fileName).name}${extFromUrl}`;
        }
      } catch (error) {
        // ignore
      }
    }
  }

  if (expectedType === 'xlsx' && !isSpreadsheetLikeBuffer(buffer, contentType, fileName)) {
    const preview = buffer.toString('utf8', 0, 300);
    throw new Error(
      `Downloaded spreadsheet/files are invalid. content-type=${contentType}, fileName=${fileName}, body=${preview}`
    );
  }

  if (expectedType === 'pdf' && !isPdfBuffer(buffer, contentType)) {
    const preview = buffer.toString('utf8', 0, 300);
    throw new Error(
      `Downloaded PDF is invalid. content-type=${contentType}, fileName=${fileName}, body=${preview}`
    );
  }

  return {
    buffer,
    contentType,
    fileName
  };
}

async function uploadBufferToCloudinary({ buffer, folder, fileNameWithExt }) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        access_mode: "public", // Make the file publicly accessible
        asset_folder: folder,
        public_id: fileNameWithExt,
        use_asset_folder_as_public_id_prefix: true,
        overwrite: true,
        invalidate: true,
        use_filename: false,
        unique_filename: false,
        display_name: fileNameWithExt
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

async function updateReportDocWithCloudinaryLinks(serviceHistoryDocId, pdfCloudinaryUrl, xlsxCloudinaryUrl) {
  try {
    if (!serviceHistoryDocId) {
      return {
        updated: false,
        message: 'serviceHistoryDocId not provided.'
      };
    }

    if (!mongoose.isValidObjectId(serviceHistoryDocId)) {
      return {
        updated: false,
        message: 'Invalid serviceHistoryDocId.'
      };
    }

    const updatePayload = {};

    if (pdfCloudinaryUrl) {
      updatePayload.otobixPdfReportUrl = pdfCloudinaryUrl;
    }

    if (xlsxCloudinaryUrl) {
      updatePayload.xlsxFileUrl = xlsxCloudinaryUrl;
    }

    if (Object.keys(updatePayload).length === 0) {
      return {
        updated: false,
        message: 'No Cloudinary links available to update.'
      };
    }

    await ServiceHistoryReportsModel.findByIdAndUpdate(
      serviceHistoryDocId,
      updatePayload,
      { new: true }
    );

    return {
      updated: true,
      message: 'Cloudinary links saved in report document.'
    };
  } catch (error) {
    return {
      updated: false,
      message: error.message
    };
  }
}

async function processServiceHistoryReportFiles({
  reportPageUrl,
  registrationNumber,
  requestId = '',
  make = '',
  model = '',
  serviceHistoryDocId = ''
}) {
  const result = {
    success: false,
    message: '',
    data: {
      reportPageUrl: reportPageUrl || '',
      serviceHistoryDocId: serviceHistoryDocId || '',
      cloudinaryFolder: buildCloudinaryFolder(registrationNumber),
      dbUpdate: {
        attempted: false,
        updated: false,
        message: ''
      },
      pdf: {
        found: false,
        uploaded: false,
        sourceUrl: '',
        cloudinaryUrl: '',
        publicId: '',
        fileName: ''
      },
      xlsx: {
        found: false,
        uploaded: false,
        sourceUrl: '',
        cloudinaryUrl: '',
        publicId: '',
        fileName: ''
      }
    },
    errors: []
  };

  let context = null;
  let page = null;

  try {
    if (!reportPageUrl) {
      result.message = 'reportPageUrl is required.';
      result.errors.push('Missing reportPageUrl.');
      return result;
    }

    if (!registrationNumber) {
      result.message = 'registrationNumber is required.';
      result.errors.push('Missing registrationNumber.');
      return result;
    }

    const folder = buildCloudinaryFolder(registrationNumber);
    const safeRegistrationNumber = sanitizePathPart(registrationNumber);
    const safeRequestId = sanitizePathPart(requestId || 'request');
    const safeMake = sanitizePathPart(make || 'make');
    const safeModel = sanitizePathPart(model || 'model');
    const baseName = `${safeRegistrationNumber}_${safeMake}_${safeModel}_${safeRequestId}`;

    const httpClient = createHttpClient();

    ({ context, page } = await openReportPage(reportPageUrl));

    const xlsxUrl = await extractXlsxUrlFromPage(page);
    const xlsxCookieHeader = xlsxUrl ? await buildCookieHeaderForUrl(context, xlsxUrl) : '';

    result.data.xlsx.sourceUrl = xlsxUrl || '';
    result.data.xlsx.found = !!xlsxUrl;

    try {
      result.data.pdf.found = true;
      result.data.pdf.sourceUrl = reportPageUrl;

      const generatedPdf = await generatePdfFromOpenPage(
        page,
        reportPageUrl,
        `${baseName}_report.pdf`
      );

      result.data.pdf.fileName = generatedPdf.fileName;
      result.data.pdf.sourceUrl = generatedPdf.sourceUrl;

      const pdfUpload = await uploadBufferToCloudinary({
        buffer: generatedPdf.buffer,
        folder,
        fileNameWithExt: generatedPdf.fileName
      });

      result.data.pdf.uploaded = true;
      result.data.pdf.cloudinaryUrl = pdfUpload.secure_url || '';
      result.data.pdf.publicId = pdfUpload.public_id || '';
    } catch (pdfError) {
      result.data.pdf.found = false;
      result.errors.push(`PDF process failed: ${pdfError.message}`);
    }

    if (context) {
      await context.close();
      context = null;
      page = null;
    }

    if (xlsxUrl) {
      try {
        const xlsxDownload = await downloadFile(
          httpClient,
          xlsxUrl,
          reportPageUrl,
          `${baseName}_files.xlsx`,
          'xlsx',
          xlsxCookieHeader
        );

        result.data.xlsx.fileName = xlsxDownload.fileName;

        const xlsxUpload = await uploadBufferToCloudinary({
          buffer: xlsxDownload.buffer,
          folder,
          fileNameWithExt: xlsxDownload.fileName
        });

        result.data.xlsx.uploaded = true;
        result.data.xlsx.cloudinaryUrl = xlsxUpload.secure_url || '';
        result.data.xlsx.publicId = xlsxUpload.public_id || '';
      } catch (xlsxError) {
        result.errors.push(`Files/XLSX process failed: ${xlsxError.message}`);
      }
    } else {
      result.errors.push('Files/XLSX download link not found on report page.');
    }

    result.data.dbUpdate.attempted = true;

    const dbUpdateResult = await updateReportDocWithCloudinaryLinks(
      serviceHistoryDocId,
      result.data.pdf.cloudinaryUrl,
      result.data.xlsx.cloudinaryUrl
    );

    result.data.dbUpdate.updated = dbUpdateResult.updated;
    result.data.dbUpdate.message = dbUpdateResult.message;

    if (!dbUpdateResult.updated && serviceHistoryDocId) {
      result.errors.push(`Report doc update failed: ${dbUpdateResult.message}`);
    }

    if (result.data.pdf.uploaded || result.data.xlsx.uploaded) {
      result.success = true;
      result.message = result.data.pdf.uploaded && result.data.xlsx.uploaded
        ? 'PDF and files uploaded successfully.'
        : 'Partial success. Some files uploaded and some failed.';
    } else {
      result.success = false;
      result.message = 'No file could be uploaded.';
    }

    return result;
  } catch (error) {
    result.success = false;
    result.message = 'Unexpected error while processing service history report files.';
    result.errors.push(error.message);
    return result;
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error) {
        // ignore
      }
    }
  }
}

module.exports = {
  processServiceHistoryReportFiles
};

