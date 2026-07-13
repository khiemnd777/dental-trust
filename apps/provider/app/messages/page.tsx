import { MessagesWorkspace } from '@/components/messages-workspace';
import { getCases, getProviderMessages } from '@/lib/provider-data';
import { requireProviderSession } from '@/lib/require-session';

export default async function Messages() {
  const [threads, cases, session] = await Promise.all([
    getProviderMessages(),
    getCases(),
    requireProviderSession(),
  ]);
  return (
    <main className="provider-main provider-main--messages">
      <header className="provider-page-header">
        <div>
          <span className="provider-eyebrow">Trao đổi theo hồ sơ</span>
          <h1>Tin nhắn bảo mật</h1>
          <p>Trao đổi với bệnh nhân và điều phối viên trong đúng phạm vi ca được phân công.</p>
        </div>
      </header>
      <MessagesWorkspace cases={cases} currentUserId={session.userId} threads={threads} />
    </main>
  );
}
