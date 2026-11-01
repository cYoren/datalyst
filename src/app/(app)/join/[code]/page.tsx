import { StudyJoin } from '@/components/studies/StudyParticipant';
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) { return <StudyJoin code={(await params).code} />; }
