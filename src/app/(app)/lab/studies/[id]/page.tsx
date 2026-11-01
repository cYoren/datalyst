import { StudyDashboard } from '@/components/studies/StudyWorkspace';
export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) { return <StudyDashboard id={(await params).id} />; }
