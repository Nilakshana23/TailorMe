const collections = [
    {
        "image": "https://lh3.googleusercontent.com/aida-public/AB6AXuCSFAbkCQJAhuP3eox5sWx7GPUcqL-33ZH8nLmGLaT21AskusgLByxVzam5Y_-W0gAC2qWsB11TmKxOxNJwYAkYZ24UJWmILjhGV0qQzbNcUXKjg6-KIY-x7oLDyUgNcQtUQARwcV0_u0tF2IW1qrZjrhSGyZpvl7-ZjhRgvatcHLO7eAJHWd1Ley7VWCgQhvqi3uF7XwKRlj8WBvglxjlrfH7kUM6gwqe5rmvuKmM6Ut6F2Sgoe6IsqS59UXtda4hss3urFMGIt2E",
        "number": "01. Collection",
        "title": "Bridal Couture"
    },
    {
        "image": "https://lh3.googleusercontent.com/aida-public/AB6AXuASYlDYzySC2_I6FZYIQMItQXperoddN-CHQkA1OV4nfbzT17CTLxARR3t4TItIwG5X3XbEys0QRKQzEqJZEZVs7f581qNdZoylBI5ZnZZV0tDqkcINe6ZgyP412yPcLhJeXwq9vqMyZ-GaKOEzYdZ0NHxxILimi2xuJvteFOHnnvTmQQjp2MI5kpYXFaLAFwTTdoRBMKdLXo5tGiYziWh4k7P97P8C3S7YHOaz75JyZe04vlTSdZiYfy52w24Q8zTDhCYzULnnrxk",
        "number": "02. Collection",
        "title": "Evening Gala"
    },
    {
        "image": "https://lh3.googleusercontent.com/aida-public/AB6AXuBzLkjOiN_a1Lq6X0tS8L2YSA5PD_OW9wrI0dJyOE_vAIJBcSBuvNn8XenotXX8O5OTufdv3rlxHTa_GOrNvVs6BtCl2JbTWE4v7__Xk_6FmmnRsINc0_nC2ali0JkAnq47qBPZsYWC23HknP4twoSkPltoltZVtaw9y8Y-u3iVJd3hkDDhP4MX3jEM5kDvt9MGHogP1vVDac0cyS4kuRkoFv5HQ9PKcn13gWqfTn0d9Qxs9G2bCvjT1Nzw35W4gYs2nGDQV3pNsM4",
        "number": "03. Collection",
        "title": "Modern Casual"
    }
];
export default function CollectionsSection() {
    return (<section id="collections" className="section-spacing bg-surface-container-low">
    <div className="page-container">
    <div className="flex flex-col md:flex-row justify-between items-start gap-8 md:items-end mb-12 md:mb-20">
    <div className="max-w-xl">
    <h2 className="font-display-lg text-display-lg mb-6">Style Categories</h2>
    <p className="font-body-lg text-body-lg text-on-surface-variant">Explore garment inspiration for your next design. These images are style references, not products for sale.</p>
    </div>
    <a className="flex items-center text-primary font-label-md text-label-md group" href="#collection-cards">
                        EXPLORE ALL CATEGORIES
                        <span className="material-symbols-outlined ml-2 transition-transform group-hover:translate-x-1">arrow_right_alt</span>
    </a>
    </div>
    <div id="collection-cards" className="grid grid-cols-1 md:grid-cols-3 gap-12">{collections.map((collection) => <CollectionCard key={collection.title} {...collection}/>)}</div></div></section>);
}
function CollectionCard({ image, number, title }: {
    image: string;
    number: string;
    title: string;
}) { return <article className="landing-category-card"><div className="relative rounded-2xl overflow-hidden aspect-[3/4] mb-8 luxury-shadow"><img loading="lazy" className="w-full h-full object-cover" src={image} alt={title}/><div className="absolute inset-0 bg-black/10 transition-colors"/></div><div className="flex justify-between items-center"><div><p className="text-label-sm text-on-surface-variant uppercase tracking-widest mb-1">{number}</p><h3 className="font-headline-sm text-headline-sm">{title}</h3></div></div></article>; }
