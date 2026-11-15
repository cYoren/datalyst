import { notFound } from 'next/navigation';
import { SELF_HOSTED } from '@/lib/self-hosted';
import LogsView from './LogsView';

/**
 * Raw activity and session history.
 *
 * This is a debugging surface for whoever runs the server, not something a
 * person tracking a symptom should ever land on (`ROADMAP.md` T5), so Cloud
 * does not serve it at all.
 */
export default function LogsPage() {
    if (!SELF_HOSTED) notFound();
    return <LogsView />;
}
