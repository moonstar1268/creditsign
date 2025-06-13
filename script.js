/* ===== 전역 변수 ===== */
let pdfDoc = null,
  pdfBytes = null;
let signaturePad = null,
  sigDataURL = null;
let selectedPage = 0,
  clickPos = null;

/* ===== 서명패드 초기화 ===== */
function initPad() {
  const canvas = document.getElementById("sig-canvas");
  signaturePad = new SignaturePad(canvas);
  document.getElementById("clear").onclick = () => signaturePad.clear();
  document.getElementById("save-sig").onclick = () => {
    if (signaturePad.isEmpty()) {
      alert("서명을 입력해주세요");
      return;
    }
    sigDataURL = signaturePad.toDataURL();
    document.getElementById("pad-wrapper").classList.add("hidden");
    document.getElementById("download").disabled = false;
  };
}

/* ===== PDF 업로드 & 미리보기 ===== */
document.getElementById("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pdfBytes = await file.arrayBuffer();
  pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
  await renderPreview();
  document.getElementById("open-pad").disabled = false;
});

async function renderPreview() {
  const wrap = document.getElementById("pdf-preview");
  wrap.innerHTML = "";
  const task = pdfjsLib.getDocument({ data: pdfBytes });
  const pdf = await task.promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

    canvas.dataset.idx = i - 1;

    canvas.onclick = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      selectedPage = Number(canvas.dataset.idx);
      clickPos = {
        x: (ev.clientX - rect.left) * scaleX,
        y: (ev.clientY - rect.top) * scaleY,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      };
      alert('서명 위치가 저장되었습니다 ➡️ "서명 추가"를 클릭해주세요');
    };

    wrap.appendChild(canvas);
  }
}

/* ===== 서명 입력 모달 열기 ===== */
document.getElementById("open-pad").onclick = () => {
  if (!pdfDoc) {
    alert("먼저 PDF를 업로드해주세요");
    return;
  }
  document.getElementById("pad-wrapper").classList.remove("hidden");
  if (!signaturePad) initPad();
  signaturePad.clear();
};

/* ===== 최종 PDF 생성 & 다운로드 ===== */
document.getElementById("download").onclick = async () => {
  if (!sigDataURL || !clickPos) {
    alert("서명과 위치가 모두 필요합니다");
    return;
  }

  const { x, y, canvasWidth, canvasHeight } = clickPos;
  const page = pdfDoc.getPages()[selectedPage];
  const png = await pdfDoc.embedPng(sigDataURL);
  const dims = png.scale(0.5);

  // 정확한 캔버스 좌표 → PDF 좌표 변환
  const scaleX = page.getWidth() / canvasWidth;
  const scaleY = page.getHeight() / canvasHeight;

  let pdfX = x * scaleX;
  let pdfY = page.getHeight() - y * scaleY - dims.height;

  // 사용자 요청에 따른 평행이동 적용 (가로로 -0.05x, 세로로 +0.05y)
  const offsetX = -0.15 * page.getWidth();
  const offsetY = 0.15 * page.getHeight();

  pdfX += offsetX;
  pdfY += offsetY;

  page.drawImage(png, { x: pdfX, y: pdfY, width: dims.width, height: dims.height });

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "signed.pdf";
  a.click();
  URL.revokeObjectURL(url);
};

/* ===== PDF.js 워커 경로 설정 ===== */
window.onload = () => {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
};
