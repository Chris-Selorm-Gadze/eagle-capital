import { toPng } from 'html-to-image'

/** Renders a DOM node to a PNG and triggers a download — used for the dashboard "snapshot" button. */
export async function downloadElementAsImage(node: HTMLElement, filename: string) {
  const dataUrl = await toPng(node, {
    backgroundColor: getComputedStyle(document.body).getPropertyValue('--page-bg') || '#0d0d0d',
    pixelRatio: 2,
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
