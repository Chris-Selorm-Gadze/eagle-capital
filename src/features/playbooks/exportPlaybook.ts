import type { Playbook, PlaybookExample, Trade } from '../../types'
import { winRate, profitFactor, dayWinRate, avgWin, avgLoss, avgTradeDurationMinutes, netPnl } from '../../utils/tradeStats'
import { dailyPnlSeries } from '../../utils/tradeAggregates'
import { formatDuration } from '../../utils/format'
import { realizedRMultiple } from '../../utils/tradeRisk'

function tradeChipLabel(trade: Trade): string {
  const sign = trade.pnl >= 0 ? '+' : '-'
  return `${trade.symbol} · ${trade.date} · ${sign}$${Math.abs(trade.pnl).toLocaleString()}`
}

function fmtPnl(v: number): string {
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString()}`
}

function fmtR(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}R`
}

/** Same metrics as PlaybookStats.tsx (+ net P&L / R range from the grid card) — keeps the export
 * consistent with whatever the dialog itself is showing, rather than a second, drifting set of numbers. */
function statLines(trades: Trade[]): string[] {
  if (trades.length === 0) return ['Link examples to logged trades to see performance stats for this playbook.']

  const pf = profitFactor(trades)
  const daily = dailyPnlSeries(trades)
  const aw = avgWin(trades)
  const al = avgLoss(trades)
  const ratio = al !== 0 ? Math.abs(aw / al) : aw > 0 ? Infinity : 0
  const rValues = trades
    .map((t) => realizedRMultiple({ entryPrice: t.entryPrice, stopLoss: t.stopLoss, exitPrice: t.exitPrice, side: t.side }))
    .filter((r): r is number => r !== null)

  const lines = [
    `Win rate: ${Math.round(winRate(trades) * 100)}%`,
    `Trades: ${trades.length}`,
    `Net P&L: ${fmtPnl(netPnl(trades))}`,
    `Profit factor: ${pf === Infinity ? '∞' : pf.toFixed(2)}`,
    `Daily win rate: ${Math.round(dayWinRate(daily.map((d) => d.pnl)) * 100)}%`,
    `Avg trade duration: ${formatDuration(avgTradeDurationMinutes(trades))}`,
    `Win/Loss ratio: ${ratio === Infinity ? '∞' : ratio.toFixed(2)}`,
  ]
  if (rValues.length > 0) {
    lines.push(`R range: ${fmtR(Math.min(...rValues))} / ${fmtR(Math.max(...rValues))}`)
  }
  return lines
}

interface FetchedImage {
  bytes: ArrayBuffer
  mime: string
  width: number
  height: number
}

/** Best-effort — a CORS hiccup or a transient storage error on one example image must not sink
 * the whole export, just that one image (falls back to a text note in its place). */
async function fetchImageWithDims(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const mime = blob.type || 'image/png'
    const bytes = await blob.arrayBuffer()
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(blob)
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
        URL.revokeObjectURL(objectUrl)
      }
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('image decode failed'))
      }
      img.src = objectUrl
    })
    return { bytes, mime, ...dims }
  } catch {
    return null
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'playbook'
}

/** Routes through the OS share sheet when the platform supports sharing files (mobile Safari/
 * Chrome, some desktop browsers) so "export" can double as "send to someone" like the old text
 * Share button did; falls back to a plain download everywhere else (most desktop browsers). */
async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch {
      // user cancelled the share sheet — fall through to a direct download instead of erroring
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportPlaybookPdf(
  playbook: Playbook,
  examples: PlaybookExample[],
  tradeById: Map<string | undefined, Trade | undefined>,
  linkedTrades: Trade[],
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - marginX * 2
  let y = 50

  function ensureSpace(next: number) {
    if (y + next > pageHeight - 40) {
      doc.addPage()
      y = 50
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(`${playbook.name}${playbook.grade ? `  (${playbook.grade})` : ''}`, marginX, y)
  y += 26

  if (playbook.description) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    const lines = doc.splitTextToSize(playbook.description, maxWidth) as string[]
    ensureSpace(lines.length * 14)
    doc.text(lines, marginX, y)
    y += lines.length * 14 + 16
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  ensureSpace(20)
  doc.text('Performance', marginX, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  for (const line of statLines(linkedTrades)) {
    ensureSpace(16)
    doc.text(line, marginX, y)
    y += 16
  }
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  ensureSpace(20)
  doc.text(`Examples (${examples.length})`, marginX, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)

  for (const ex of examples) {
    const trade = ex.tradeId ? tradeById.get(ex.tradeId) : undefined
    if (trade) {
      ensureSpace(16)
      doc.setFont('helvetica', 'bold')
      doc.text(tradeChipLabel(trade), marginX, y)
      doc.setFont('helvetica', 'normal')
      y += 16
    }
    if (ex.note) {
      const noteLines = doc.splitTextToSize(ex.note, maxWidth) as string[]
      ensureSpace(noteLines.length * 14)
      doc.text(noteLines, marginX, y)
      y += noteLines.length * 14 + 6
    }
    if (ex.imageUrl) {
      const img = await fetchImageWithDims(ex.imageUrl)
      const format = img?.mime.includes('png') ? 'PNG' : img?.mime.includes('jpeg') || img?.mime.includes('jpg') ? 'JPEG' : null
      if (img && format) {
        const displayWidth = Math.min(maxWidth, 320)
        const displayHeight = displayWidth * (img.height / img.width)
        ensureSpace(displayHeight + 12)
        const base64 = arrayBufferToBase64(img.bytes)
        doc.addImage(`data:${img.mime};base64,${base64}`, format, marginX, y, displayWidth, displayHeight)
        y += displayHeight + 12
      } else {
        ensureSpace(16)
        doc.text('[image could not be included in this export]', marginX, y)
        y += 16
      }
    }
    y += 10
  }

  await shareOrDownload(doc.output('blob'), `${safeFileName(playbook.name)}.pdf`)
}

export async function exportPlaybookDocx(
  playbook: Playbook,
  examples: PlaybookExample[],
  tradeById: Map<string | undefined, Trade | undefined>,
  linkedTrades: Trade[],
): Promise<void> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun } = await import('docx')
  const children: InstanceType<typeof Paragraph>[] = []

  children.push(new Paragraph({ text: `${playbook.name}${playbook.grade ? ` (${playbook.grade})` : ''}`, heading: HeadingLevel.HEADING_1 }))

  if (playbook.description) {
    children.push(new Paragraph({ text: playbook.description }))
  }

  children.push(new Paragraph({ text: 'Performance', heading: HeadingLevel.HEADING_2 }))
  for (const line of statLines(linkedTrades)) {
    children.push(new Paragraph({ text: line }))
  }

  children.push(new Paragraph({ text: `Examples (${examples.length})`, heading: HeadingLevel.HEADING_2 }))

  for (const ex of examples) {
    const trade = ex.tradeId ? tradeById.get(ex.tradeId) : undefined
    if (trade) {
      children.push(new Paragraph({ children: [new TextRun({ text: tradeChipLabel(trade), bold: true })] }))
    }
    if (ex.note) {
      children.push(new Paragraph({ text: ex.note }))
    }
    if (ex.imageUrl) {
      const img = await fetchImageWithDims(ex.imageUrl)
      const type = img?.mime.includes('png') ? 'png' : img?.mime.includes('jpeg') || img?.mime.includes('jpg') ? 'jpg' : null
      if (img && type) {
        const displayWidth = Math.min(500, img.width)
        const displayHeight = displayWidth * (img.height / img.width)
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type,
                data: img.bytes,
                transformation: { width: displayWidth, height: displayHeight },
              }),
            ],
          }),
        )
      } else {
        children.push(new Paragraph({ text: '[image could not be included in this export]' }))
      }
    }
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  await shareOrDownload(blob, `${safeFileName(playbook.name)}.docx`)
}
