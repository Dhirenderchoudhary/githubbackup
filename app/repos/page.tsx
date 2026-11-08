import { Gate } from '@/components/gate'
import { ReposForm } from '@/components/repos-form'

export default function ReposPage() {
  return (
    <Gate id="repos">
      <ReposForm />
    </Gate>
  )
}
