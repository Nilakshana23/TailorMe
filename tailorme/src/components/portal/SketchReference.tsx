import DesignIllustration from './DesignIllustration'
import type {DesignFields} from '../../services/designService'
export default function SketchReference({design}:{design:DesignFields}){
 const reference=design.source_reference
 if(!reference||!design.include_source_reference)return null
 return <section className="refinement-reference" aria-label="Included original sketch reference"><h3>Original sketch reference included</h3><p>{reference.design.name} · saved sketch version {reference.version}</p><p>Original buttons, pleats and decorations remain in this reference. The template does not reproduce them automatically.</p><DesignIllustration design={reference.design}/></section>
}
