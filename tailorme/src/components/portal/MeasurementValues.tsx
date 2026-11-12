import {measurementFields} from '../../utils/measurements'
import type {MeasurementShare} from '../../services/measurementService'
export default function MeasurementValues({profile}:{profile:MeasurementShare}) {
 return <><p className="mt-3 font-semibold">Customer-provided; tailor confirmation recommended</p><p>Measured on: <time dateTime={profile.measured_on}>{profile.measured_on}</time></p><dl className="application-details mt-4">{measurementFields.filter(([key])=>profile.values_cm[key]!==undefined).map(([key,label,kind])=><div key={key}><dt>{label} ({kind})</dt><dd>{profile.values_cm[key]} cm</dd></div>)}</dl></>
}
