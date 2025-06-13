/* ===== 전역 변수 ===== */
let pdfDoc=null, pdfBytes=null;
let signaturePad=null, sigDataURL=null;
let selectedPage=0, currentCanvas=null;
let sigImg = new Image();
let sigX=100, sigY=100, sigScale=1.0;

/* ===== 서명패드 초기화 ===== */
function initPad(){
  const canvas=document.getElementById("sig-canvas");
  signaturePad=new SignaturePad(canvas);
  document.getElementById("clear").onclick=()=>signaturePad.clear();
  document.getElementById("save-sig").onclick=()=>{
    if(signaturePad.isEmpty()){alert("서명을 입력해주세요");return;}
    sigDataURL=signaturePad.toDataURL();
    sigImg.src = sigDataURL;
    document.getElementById("pad-wrapper").classList.add("hidden");
    drawSignature();
    document.getElementById("download").disabled=false;
  };
}

/* ===== PDF 업로드 & 미리보기 ===== */
document.getElementById("file-input").addEventListener("change",async(e)=>{
  const file=e.target.files[0];
  if(!file) return;
  pdfBytes=await file.arrayBuffer();
  pdfDoc=await PDFLib.PDFDocument.load(pdfBytes);
  await renderPreview();
  document.getElementById("open-pad").disabled=false;
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

    canvas.onclick=()=>{
      selectedPage=Number(canvas.dataset.idx);
      currentCanvas=canvas;
      alert('페이지가 선택되었습니다. 이제 "+서명 추가"를 클릭해주세요.');
    };

    wrap.appendChild(canvas);
  }
}

/* ===== 서명 입력 모달 열기 ===== */
document.getElementById("open-pad").onclick=()=>{
  if(!pdfDoc || currentCanvas===null){alert("먼저 PDF를 업로드하고 페이지를 클릭해주세요");return;}
  document.getElementById("pad-wrapper").classList.remove("hidden");
  if(!signaturePad) initPad();
  signaturePad.clear();
};

/* ===== 서명 이미지 드래그 및 크기 조절 ===== */
function drawSignature(){
  const ctx=currentCanvas.getContext('2d');
  ctx.clearRect(0,0,currentCanvas.width,currentCanvas.height);
  pdfjsLib.getDocument({data:pdfBytes}).promise.then(async(pdf)=>{
    const page=await pdf.getPage(selectedPage+1);
    const viewport=page.getViewport({scale:1.0});
    await page.render({canvasContext:ctx,viewport}).promise;

    sigX=currentCanvas.width/2-50;
    sigY=currentCanvas.height/2-25;

    const draw=()=>{
      ctx.clearRect(0,0,currentCanvas.width,currentCanvas.height);
      page.render({canvasContext:ctx,viewport}).promise.then(()=>{
        ctx.drawImage(sigImg,sigX,sigY,sigImg.width*sigScale,sigImg.height*sigScale);
      });
    };
    
    sigImg.onload=draw;

    let dragging=false;
    currentCanvas.onmousedown=(e)=>{
      const rect=currentCanvas.getBoundingClientRect();
      const x=e.clientX-rect.left, y=e.clientY-rect.top;
      if(x>sigX && x<sigX+sigImg.width*sigScale && y>sigY && y<sigY+sigImg.height*sigScale){
        dragging=true;
      }
    };
    currentCanvas.onmousemove=(e)=>{
      if(dragging){
        const rect=currentCanvas.getBoundingClientRect();
        sigX=e.clientX-rect.left-(sigImg.width*sigScale/2);
        sigY=e.clientY-rect.top-(sigImg.height*sigScale/2);
        draw();
      }
    };
    currentCanvas.onmouseup=()=>dragging=false;
    currentCanvas.onwheel=(e)=>{
      e.preventDefault();
      sigScale+=e.deltaY* -0.001;
      sigScale=Math.min(Math.max(0.1,sigScale),5);
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
