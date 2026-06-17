export function renderMagicLinkEmail({ url }: { url: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Sign in to Heritage Lab Intranet";

  const text = [
    "Sign in to the Heritage Lab Intranet",
    "",
    "Click the link below to sign in. The link expires in 30 minutes and can only be used once.",
    "",
    url,
    "",
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f8f6f1; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1f2421;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#ffffff; border:1px solid #e4e2db; border-radius:8px; padding:32px;">
            <tr>
              <td>
                <div style="font-family: Georgia, serif; font-size:22px; font-weight:600; color:#3d5a3b; margin-bottom:4px;">
                  Heritage Lab Intranet
                </div>
                <div style="font-size:13px; color:#6b7066; margin-bottom:24px;">
                  Sign in link
                </div>
                <p style="font-size:15px; line-height:1.55; margin:0 0 24px;">
                  Click the button below to sign in. The link expires in 30 minutes and can only be used once.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${url}" style="display:inline-block; background:#4d6a4b; color:#ffffff; text-decoration:none; padding:12px 22px; border-radius:6px; font-weight:600; font-size:15px;">
                    Sign in to the Intranet
                  </a>
                </p>
                <p style="font-size:13px; color:#6b7066; line-height:1.55; margin:0 0 8px;">
                  Or paste this URL into your browser:
                </p>
                <p style="font-size:12px; color:#3d5a3b; word-break:break-all; margin:0 0 24px;">
                  ${url}
                </p>
                <hr style="border:none; border-top:1px solid #e4e2db; margin:24px 0;" />
                <p style="font-size:12px; color:#6b7066; line-height:1.55; margin:0;">
                  If you didn't request this sign-in link, you can safely ignore this email. No account will be created or accessed without clicking the link.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
