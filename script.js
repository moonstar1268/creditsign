/* ===== 전역 변수 ===== */
let pdfDoc=null, pdfBytes=null;
let signaturePad=null, sigDataURL=null;
let selectedPage=0, currentCanvas=null;
let sigImg=new Image();
let sigX=0, sigY=0, sigScale=1.0;
let signaturePlaced=false; // <-- 추가된 플래그 변수

/* ===== 서명패드 초기화 ===== */
function initPad(){
  const canvas=document.getElementById("sig-canvas");
  signaturePad=new SignaturePad(canvas);
  document.getElementById("clear").onclick=()=>signaturePad.clear();
  document.getElementById("save-sig").onclick=()=>{
    if(signaturePad.isEmpty()){alert("서명을 입력해주세요");return;}
    sigDataURL=signaturePad.toDataURL();
    sigImg.src=sigDataURL;
    document.getElementById("pad-wrapper").classList.add("hidden");
    document.getElementById("download").disabled=false;
    
    sigImg.onload=()=>{
      drawSignature();
      signaturePlaced=true; // <-- 서명 추가 완료 시 true로 설정
    };
  };
}

/* ===== PDF 업로드 & 미리보기 ===== */
document.getElementById("file-input").addEventListener("change",async(e)=>{
  const file=e.target.files[0];
  if(!file)return;
  pdfBytes=await file.arrayBuffer();
  pdfDoc=await PDFLib.PDFDocument.load(pdfBytes);
  await renderPreview();
  document.getElementById("open-pad").disabled=false;
  signaturePlaced=false; // <-- PDF 새로 업로드 시 초기화
});

async function renderPreview(){
  const wrap=document.getElementById("pdf-preview");
  wrap.innerHTML='';
  const task=pdfjsLib.getDocument({data:pdfBytes});
  const pdf=await task.promise;

  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const viewport=page.getViewport({scale:1.0});
    const canvas=document.createElement("canvas");
    canvas.width=viewport.width; canvas.height=viewport.height;
    await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;

    canvas.dataset.idx=i-1;

    canvas.onclick=(ev)=>{
      const rect=canvas.getBoundingClientRect();
      const scaleX=canvas.width/rect.width;
      const scaleY=canvas.height/rect.height;

      selectedPage=Number(canvas.dataset.idx);
      currentCanvas=canvas;

      if (!signaturePlaced){ // <-- 서명이 아직 없을 때만 메시지 출력 및 위치 저장
        sigX=(ev.clientX-rect.left)*scaleX;
        sigY=(ev.clientY-rect.top)*scaleY;
        alert('위치가 저장되었습니다 ➡️ "+서명 추가"를 클릭해주세요');
      }
    };

    wrap.appendChild(canvas);
  }
}

/* ===== 서명 입력 모달 열기 ===== */
document.getElementById("open-pad").onclick=()=>{
  if(!pdfDoc||currentCanvas===null){alert("먼저 PDF를 업로드하고 서명 위치를 클릭해주세요");return;}
  document.getElementById("pad-wrapper").classList.remove("hidden");
  if(!signaturePad)initPad();
  signaturePad.clear();
};

/* ===== 서명 이미지 드래그 및 크기 조절 ===== */
function drawSignature(){
  const ctx=currentCanvas.getContext('2d');
  pdfjsLib.getDocument({data:pdfBytes}).promise.then(async(pdf)=>{
    const page=await pdf.getPage(selectedPage+1);
    const viewport=page.getViewport({scale:1.0});

    const draw=()=>{
      ctx.clearRect(0,0,currentCanvas.width,currentCanvas.height);
      page.render({canvasContext:ctx,viewport}).promise.then(()=>{
        ctx.drawImage(sigImg,sigX,sigY,sigImg.width*sigScale,sigImg.height*sigScale);
      });
    };

    draw();

    let dragging=false, offsetX, offsetY;
    currentCanvas.onmousedown=(e)=>{
      const rect=currentCanvas.getBoundingClientRect();
      const x=(e.clientX-rect.left)*(currentCanvas.width/rect.width);
      const y=(e.clientY-rect.top)*(currentCanvas.height/rect.height);

      if(x>sigX&&x<sigX+sigImg.width*sigScale&&y>sigY&&y<sigY+sigImg.height*sigScale){
        dragging=true;
        offsetX=x-sigX;
        offsetY=y-sigY;
      }
    };
    currentCanvas.onmousemove=(e)=>{
      if(dragging){
        const rect=currentCanvas.getBoundingClientRect();
        const x=(e.clientX-rect.left)*(currentCanvas.width/rect.width);
        const y=(e.clientY-rect.top)*(currentCanvas.height/rect.height);
        sigX=x-offsetX;
        sigY=y-offsetY;
        draw();
      }
    };
    currentCanvas.onmouseup=()=>dragging=false;
    currentCanvas.onwheel=(e)=>{
      e.preventDefault();
      const delta=e.deltaY<0?0.05:-0.05;
      sigScale=Math.min(Math.max(0.1,sigScale+delta),5);
      draw();
    };
  });
}

/* ===== 최종 PDF 생성 & 다운로드 ===== */
document.getElementById("download").onclick=async()=>{
  const page=pdfDoc.getPages()[selectedPage];
  const png=await pdfDoc.embedPng(sigDataURL);
  const dims=png.scale(sigScale);

  const scaleX=page.getWidth()/currentCanvas.width;
  const scaleY=page.getHeight()/currentCanvas.height;

  let pdfX=sigX*scaleX;
  let pdfY=page.getHeight()-sigY*scaleY-dims.height;

  page.drawImage(png,{x:pdfX,y:pdfY,width:dims.width,height:dims.height});
  const bytes=await pdfDoc.save();
  const blob=new Blob([bytes],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="signed.pdf"; a.click();
  URL.revokeObjectURL(url);
};

/* ===== PDF.js 워커 경로 설정 ===== */
window.onload=()=>{
  pdfjsLib.GlobalWorkerOptions.workerSrc=
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
};
