import { Gate } from '@/components/gate'
import { BackupForm } from '@/components/backup-form'

export default function BackupPage() {
  return (
    <Gate id="backup">
      <BackupForm />
    </Gate>
  )
}
