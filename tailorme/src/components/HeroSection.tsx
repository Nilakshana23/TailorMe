import { Link } from 'react-router-dom'

export default function HeroSection() {
    return (<section className="relative min-h-[680px] lg:min-h-[921px] flex items-center overflow-hidden bg-surface-container-lowest">
    <div className="absolute inset-0 z-0">
    <div className="absolute inset-0 hero-gradient z-10"></div>
    <img className="w-full h-full object-cover" alt="A high-fashion editorial wide shot featuring a stunning bespoke evening gown in a light cream silk, being meticulously draped over a minimalist mannequin in a sun-drenched, airy atelier. The background shows rolls of fine fabrics and professional tailoring tools. The overall mood is quiet, artisanal, and luxurious with a soft beige and bright white color palette." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDthmwtbexbMSh1movD6WpYVGcOv3nU-9mR5P1WRJ0-A46oEsnOK7j3GSGbquLcIH7AZyFoSKo1Vekn_g6x4JkBSsUdsfGvuO3Hdp086jdXVlzPCvoaFbghqflbj67DIdLJmK-aJn3Ck-jm7Msl5LBIRE9nuRldTS8h0FmjUPL0E3Hzd4dQ8ybmPuWH3NVAPzGtm59-j2DizBI8dlvlhHDPRxLM__jfuC5aaYxQzuQXyo_KwHu0Zmi5zf-7k-DLSVZPepYizkSY29o"/>
    </div>
    <div className="container mx-auto px-margin-mobile lg:px-margin-desktop relative z-20">
    <div className="max-w-2xl">
    <span className="font-label-md text-label-md uppercase tracking-[0.2em] text-secondary-fixed-dim mb-6 block">The Art of Bespoke</span>
    <h1 className="font-display-lg text-display-lg mb-8 leading-tight">Your Vision, <br /><span className="italic font-normal">Our Master Craftsmanship.</span></h1>
    <p className="font-body-lg text-body-lg text-on-surface-variant mb-10 max-w-lg">
                        Experience the pinnacle of luxury with garments tailored exclusively for your silhouette. Connect with world-class artisans to create your perfect design.
                    </p>
    <div className="flex flex-wrap gap-4">
    <Link to="/customer/designer" className="bg-primary text-on-primary px-10 py-4 rounded-lg font-label-md text-label-md hover:bg-on-surface-variant transition-all luxury-shadow">
                            Design Your Dream Dress
                        </Link>
    <Link to="/tailors" className="bg-transparent border-[1.5px] border-primary text-primary px-10 py-4 rounded-lg font-label-md text-label-md hover:bg-surface-container transition-all">
                            Find Your Tailor
                        </Link>
    </div>
    </div>
    </div>
    </section>);
}
