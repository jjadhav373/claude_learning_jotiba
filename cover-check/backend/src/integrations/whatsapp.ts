/**
 * WhatsApp sender (Gupshup BSP). Only approved utility templates are used.
 * In development, messages are logged instead of sent.
 */
export interface WhatsAppSender {
  sendTemplate(to: string, templateId: string, params: string[]): Promise<{ messageId: string }>;
}

export const gupshupSender = (cfg: { apiKey?: string; appName: string; source?: string }): WhatsAppSender => ({
  async sendTemplate(to, templateId, params) {
    if (!cfg.apiKey || !cfg.source) {
      const messageId = `dev-${Date.now().toString(36)}`;
      console.info('[whatsapp:dev]', { to, templateId, params, messageId });
      return { messageId };
    }
    const body = new URLSearchParams({
      channel: 'whatsapp', source: cfg.source, destination: to.replace('+', ''), 'src.name': cfg.appName,
      template: JSON.stringify({ id: templateId, params }),
    });
    const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
      method: 'POST', headers: { apikey: cfg.apiKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!res.ok) throw new Error(`Gupshup ${res.status}`);
    const json = (await res.json()) as { messageId?: string };
    return { messageId: json.messageId ?? 'unknown' };
  },
});
