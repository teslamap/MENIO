// Small product photos fit inside one Firestore document on the Spark plan.
export const MAX_IMAGE_DATA_LENGTH = 180000;
export function safeProductImage(value) {
  if (typeof value !== "string") return "";
  if (value.length <= MAX_IMAGE_DATA_LENGTH && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
}
function canvasJpegData(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(Error("ფოტოს შეკუმშვა ვერ მოხერხდა.")); return; }
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(Error("ფოტოს წაკითხვა ვერ მოხერხდა."));
      reader.onerror = () => reject(Error("ფოტოს წაკითხვა ვერ მოხერხდა."));
      reader.onabort = () => reject(Error("ფოტოს წაკითხვა შეწყდა."));
      reader.readAsDataURL(blob);
    }, "image/jpeg", quality);
  });
}
export async function encodeProductPhoto(file) {
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5*1024*1024) {
    throw Error("აირჩიე JPEG, PNG ან WebP ფოტო, მაქსიმუმ 5 MB.");
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw Error("ფოტოს გახსნა ვერ მოხერხდა. აირჩიე სხვა ფოტო."); }
  try {
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    if (!context) throw Error("ბრაუზერმა ფოტოს დამუშავება ვერ შეძლო.");
    for (const limit of [720,576,460,368,294,240]) {
      const scale = Math.min(1, limit / Math.max(bitmap.width,bitmap.height));
      canvas.width = Math.max(1,Math.round(bitmap.width*scale));
      canvas.height = Math.max(1,Math.round(bitmap.height*scale));
      context.fillStyle = "#fff";
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [.82,.65,.5,.35]) {
        const data = await canvasJpegData(canvas,quality);
        if (safeProductImage(data) && data.startsWith("data:image/jpeg;base64,")) return data;
      }
    }
    throw Error("ფოტო ძალიან დეტალურია. აირჩიე უფრო მარტივი ან მცირე ფოტო.");
  } finally { bitmap.close(); }
}

