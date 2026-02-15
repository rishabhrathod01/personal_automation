/**
 * One-off helper: list Whapi groups (and chats) so you can find the 565A Cook group ID.
 *
 * Usage (use your token from the Whapi dashboard):
 *   WHAPI_API_TOKEN=your_token npm run meal-plan:get-groups
 *
 * Copy the "id" or "chat_id" for the 565A Cook group into config.ts as WHAPI_GROUP_ID.
 */

import { WHAPI_BASE_URL } from './config';

const token = process.env.WHAPI_API_TOKEN;
if (!token) {
  console.error(
    'Set WHAPI_API_TOKEN (e.g. WHAPI_API_TOKEN=your_token npm run meal-plan:get-groups)'
  );
  process.exit(1);
}

interface RequestResult {
  ok: boolean;
  status: number;
  data: unknown;
}

async function request(path: string): Promise<RequestResult> {
  const res = await fetch(`${WHAPI_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main(): Promise<void> {
  console.log('Fetching /groups ...\n');
  const groups = await request('/groups');
  const data = groups.data as Record<string, unknown> & { error?: string };
  if (!groups.ok) {
    console.log('Groups response:', groups.status, JSON.stringify(groups.data, null, 2));
    if (data?.error === 'Channel not found') {
      console.log('\n"Channel not found" usually means the token or channel is not active.');
      console.log(
        'Check: (1) Token is copied correctly from the Whapi dashboard (2) WhatsApp is authorized for this channel.'
      );
    }
    console.log('\nTrying /chats ...\n');
    const chats = await request('/chats');
    console.log('Chats response:', chats.status, JSON.stringify(chats.data, null, 2));
    process.exit(1);
  }

  const rawList = Array.isArray(groups.data) ? groups.data : (groups.data as Record<string, unknown>)?.data ?? (groups.data as Record<string, unknown>)?.chats ?? [];
  const list = Array.isArray(rawList) ? rawList : [];
  if (list.length === 0) {
    console.log('No groups in response. Full response:', JSON.stringify(groups.data, null, 2));
    return;
  }

  console.log('Groups (look for 565A Cook and copy the id):\n');
  list.forEach((g: Record<string, unknown>, i: number) => {
    const id = (g.id ?? g.chat_id ?? g.jid ?? g.group_id) as string | undefined;
    const name = (g.name ?? g.title ?? g.subject ?? '') as string;
    console.log(`${i + 1}. ${name || '(no name)'}`);
    console.log(`   id: ${id ?? '(none)'}\n`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
