import { Link } from "react-router-dom";
import { BRAND } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-300">404</h1>
        <p className="text-lg text-slate-600 mt-2 mb-6">Page not found</p>
        <Link
          to="/"
          className="inline-flex px-5 py-2.5 rounded-lg text-white font-medium"
          style={{ backgroundColor: BRAND.blue }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
