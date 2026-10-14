import "./brand.css";
/** The user-provided AeroCare artwork. Technical identifiers retain their existing names. */
export const PRODUCT_NAME = "AeroCare";
export function BrandLogo({ className = "" }: { className?: string }) {
  return <img className={`aerocare-logo ${className}`} src={`${import.meta.env.BASE_URL}branding/aerocare-logo.png`} width={180} height={60} alt={PRODUCT_NAME}/>;
}
