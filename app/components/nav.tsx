import { Button } from "@/components/ui/button";
import siteData from "@/config/siteData.json";
import { signOut } from "@/lib/auth-client";
import { Link, useNavigate } from "react-router";

export function Nav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="bg-slate-100 border-b border-slate-200 flex items-center justify-between py-4 px-8 box-border">
      <Link to="/" className="block leading-3 flex items-center gap-2">
        <img
          src="/cattle-track-logo.png"
          width="50"
          height="auto"
          alt="Cattle records and information tracking interface"
          className="mx-auto  overflow-hidden rounded-xl object-contain"
        />
        <div className="font-black text-2xl">{siteData.name}</div>
      </Link>
      <div className="w-1/3 flex justify-end">
        {isLoggedIn ? (
          <Button
            onClick={async () => {
              signOut({}, { onSuccess: () => navigate("/?logout=true") });
            }}
          >
            Logout
          </Button>
        ) : (
          <Link to="/login" className="block text-center">
            <Button>Login</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
