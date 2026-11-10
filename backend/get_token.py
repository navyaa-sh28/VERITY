import sys
from supabase import create_client
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY

c = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
r = c.auth.sign_in_with_password({"email": sys.argv[1], "password": sys.argv[2]})
print(r.session.access_token)
