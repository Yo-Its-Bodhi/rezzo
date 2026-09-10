export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button className="header-link" type="submit">Log out</button>
    </form>
  );
}
