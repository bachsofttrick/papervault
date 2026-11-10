/* All sample documents are generated locally and clearly marked as fictional.
   The images are ordinary PNG BLOBs; the ticket is a minimal valid PDF BLOB. */
window.PaperVaultSamples = (() => {
  'use strict';
  function drawText(context, text, x, y, size, color, family = 'sans-serif') {
    context.font = `${size}px ${family}`;
    context.fillStyle = color;
    context.fillText(text, x, y);
  }

  function drawPerson(context, x, y, scale, color) {
    context.fillStyle = color;
    context.beginPath(); context.arc(x, y, scale * .25, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(x, y + scale * .55, scale * .42, scale * .45, 0, Math.PI, Math.PI * 2); context.fill();
  }

  async function createImage(kind) {
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'passport' ? 350 : 500;
    canvas.height = kind === 'passport' ? 440 : 320;
    const context = canvas.getContext('2d');
    if (kind === 'passport') {
      context.fillStyle = '#465245'; context.fillRect(0, 0, 350, 440);
      context.strokeStyle = '#bdb68c'; context.strokeRect(16, 16, 318, 408);
      drawText(context, 'REPUBLIC OF EXAMPLE', 42, 65, 18, '#d5c698', 'Georgia');
      context.strokeStyle = '#d5c698'; context.lineWidth = 2;
      context.beginPath(); context.arc(175, 210, 68, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.ellipse(175, 210, 30, 68, 0, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.moveTo(107, 210); context.lineTo(243, 210); context.stroke();
      context.beginPath(); context.ellipse(175, 210, 68, 30, 0, 0, Math.PI * 2); context.stroke();
      drawText(context, 'PASSPORT', 93, 340, 27, '#d5c698', 'Georgia');
      drawText(context, 'S A M P L E   O N L Y', 89, 388, 13, '#c9c6af');
    } else if (kind === 'id') {
      context.fillStyle = '#f4eedf'; context.fillRect(0, 0, 500, 320);
      context.fillStyle = '#d4dccb'; context.fillRect(0, 0, 500, 53);
      drawText(context, 'EXAMPLE IDENTITY CARD', 22, 34, 19, '#58634f', 'Georgia');
      context.fillStyle = '#dfe0d4'; context.fillRect(25, 82, 118, 151);
      drawPerson(context, 84, 128, 100, '#a1aa93');
      drawText(context, 'ALEX SAMPLE', 174, 110, 23, '#525748');
      drawText(context, 'FICTIONAL DOCUMENT', 175, 141, 12, '#9b9c89');
      drawText(context, 'ID  000 000 000', 175, 184, 16, '#6e725f');
      drawText(context, 'NOT VALID FOR IDENTIFICATION', 25, 282, 15, '#a18a6b');
    } else if (kind === 'photo') {
      context.fillStyle = '#f8f6ef'; context.fillRect(0, 0, 500, 320);
      for (const x of [17, 181, 345]) {
        context.fillStyle = '#d7e2e7'; context.fillRect(x, 18, 138, 230);
        drawPerson(context, x + 69, 98, 145, '#8a9fab');
      }
      drawText(context, 'SAMPLE · ID PHOTO SHEET', 105, 286, 16, '#7b8e96');
    } else {
      context.fillStyle = '#faf7ed'; context.fillRect(0, 0, 500, 320);
      drawText(context, 'A small reminder', 45, 70, 32, '#7c735b', 'Georgia');
      drawText(context, 'Check the essentials.', 45, 126, 21, '#8a8067');
      drawText(context, 'Passport. Tickets. A little curiosity.', 45, 166, 18, '#8a8067');
      drawText(context, 'SAMPLE DOCUMENT', 45, 275, 13, '#a59c87');
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  function createTicket() {
    const stream = 'BT /F1 24 Tf 50 740 Td (SAMPLE BOARDING PASS) Tj 0 -55 Td /F1 16 Tf (EXAMPLE AIR - FICTIONAL FLIGHT) Tj 0 -70 Td /F1 38 Tf (SFO  >  LIS) Tj 0 -60 Td /F1 16 Tf (ALEX SAMPLE / SEAT 12A / GATE 08) Tj 0 -45 Td (NOT VALID FOR TRAVEL) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const start = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    return new TextEncoder().encode(pdf);
  }

  async function create() {
    const definitions = [
      { description: 'My passport', filename: 'passport_sample.png', category: 'Identity', kind: 'passport', favorite: 1 },
      { description: 'My ID card', filename: 'id_card_sample.png', category: 'Identity', kind: 'id', favorite: 1 },
      { description: 'Flight to Lisbon', filename: 'boarding_pass_sample.pdf', category: 'Travel', kind: 'ticket', favorite: 0 },
      { description: 'ID photos', filename: 'id_photos_sample.png', category: 'Photos', kind: 'photo', favorite: 0 },
      { description: 'A note for my next trip', filename: 'travel_note_sample.png', category: 'Other', kind: 'note', favorite: 0 }
    ];
    return Promise.all(definitions.map(async (item, index) => ({ ...item, mime: item.kind === 'ticket' ? 'application/pdf' : 'image/png', data: item.kind === 'ticket' ? createTicket() : await createImage(item.kind), created_at: new Date(Date.now() - index * 86400_000).toISOString() })));
  }
  return { create };
})();
