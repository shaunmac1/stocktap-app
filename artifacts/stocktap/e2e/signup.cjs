const { createClient } = require('@supabase/supabase-js');
const url = "https://nyqohgaxvqypdvdmpyix.supabase.co";
const anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55cW9oZ2F4dnF5cGR2ZG1weWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTA5NjUsImV4cCI6MjA5ODQ4Njk2NX0.I3LUpSbwiYnRj7_-4XOyuU02smoQkZTrz7Rbng6Lfso";
(async () => {
  const sb = createClient(url, anon);
  const [email, password] = process.argv.slice(2);
  const { data, error } = await sb.auth.signUp({ email, password });
  console.log(JSON.stringify({ id: data?.user?.id, email: data?.user?.email, confirmed: data?.user?.confirmed_at, error: error?.message }));
})();
