import { StudyParticipation } from '@/components/studies/StudyParticipant';
export default async function ParticipationPage({ params }: { params: Promise<{ id: string }> }) { return <StudyParticipation id={(await params).id} />; }
