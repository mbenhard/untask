import { net, protocol } from 'electron';
import path from 'node:path';
import { app } from 'electron';

const SCHEME = 'untask-file';

const ATTACHMENTS_DIR_NAME = 'attachments';

function getAttachmentsDir(): string {
  return path.join(app.getPath('userData'), ATTACHMENTS_DIR_NAME);
}

/**
 * Declare `untask-file` as a privileged scheme.
 * MUST be called at the top level of the main process, BEFORE `app.whenReady()`.
 */
export function registerAttachmentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: false,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
  ]);
}

/**
 * Register the protocol handler that resolves `untask-file://<uuid>.<ext>` to
 * the attachment file on disk. Call inside `app.whenReady()`.
 */
export function registerAttachmentProtocol(): void {
  protocol.handle(SCHEME, (request) => {
    // URL format: untask-file://<filename>
    // new URL('untask-file://abc.png') → pathname = '//abc.png', hostname = 'abc.png'
    // Safest: strip the scheme prefix and any leading slashes.
    const raw = request.url.slice(`${SCHEME}://`.length);
    const filename = decodeURIComponent(raw);

    // Prevent directory traversal
    const basename = path.basename(filename);
    const filePath = path.join(getAttachmentsDir(), basename);

    return net.fetch(`file://${filePath}`);
  });
}
