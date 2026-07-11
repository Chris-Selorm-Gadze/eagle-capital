import { toPng } from 'html-to-image'

/** Renders a DOM node to a PNG and triggers a download — used for the dashboard and calendar "snapshot" buttons. */
export async function downloadElementAsImage(
  node: HTMLElement,
  filename: string,
  options?: { filter?: (domNode: HTMLElement) => boolean },
) {
  const dataUrl = await toPng(node, {
    backgroundColor: getComputedStyle(document.body).getPropertyValue('--page-bg') || '#0d0d0d',
    pixelRatio: 2,
    filter: options?.filter as ((domNode: HTMLElement) => boolean) | undefined,
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
