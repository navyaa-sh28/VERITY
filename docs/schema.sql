-- VERITY database schema (reference copy). Run in a new Supabase project, then create a PRIVATE storage bucket named "uploads".
create extension if not exists vector;
create type user_role as enum ('creator','reviewer','admin');
create type claim_status as enum ('supported','contradicted','outdated','unsupported','human_review');

create table profiles (id uuid primary key references auth.users on delete cascade, full_name text, role user_role not null default 'creator', created_at timestamptz default now());
create table guideline_versions (id uuid primary key default gen_random_uuid(), version text not null, notes text, tone_guidance text, is_active boolean default false, created_by uuid references profiles(id), created_at timestamptz default now(), brand_palette jsonb default '[]'::jsonb, min_contrast numeric default 4.5, logo_path text);
create table brand_rules (id uuid primary key default gen_random_uuid(), guideline_id uuid references guideline_versions(id) on delete cascade, rule_type text not null, pattern text, description text, severity text default 'high');
create table evidence_docs (id uuid primary key default gen_random_uuid(), title text not null, file_path text, trusted boolean default true, valid_until date, uploaded_by uuid references profiles(id), created_at timestamptz default now());
create table approved_claims (id uuid primary key default gen_random_uuid(), guideline_id uuid references guideline_versions(id) on delete cascade, claim_text text not null, evidence_doc_id uuid references evidence_docs(id));
create table evidence_chunks (id uuid primary key default gen_random_uuid(), doc_id uuid references evidence_docs(id) on delete cascade, chunk_index int, content text not null, embedding vector(768), page int);
create table submissions (id uuid primary key default gen_random_uuid(), creator_id uuid references profiles(id), title text, content_text text, file_path text, guideline_id uuid references guideline_versions(id), status text default 'submitted', created_at timestamptz default now(), decided_at timestamptz, page_map jsonb, source_filename text, kind text default 'text');
create table claims (id uuid primary key default gen_random_uuid(), submission_id uuid references submissions(id) on delete cascade, claim_text text not null, position int, page int);
create table findings (id uuid primary key default gen_random_uuid(), submission_id uuid references submissions(id) on delete cascade, claim_id uuid references claims(id) on delete cascade, status claim_status not null, confidence numeric, rule_type text, evidence_chunk_ids uuid[], explanation text, safer_draft text, created_at timestamptz default now());
create table decisions (id uuid primary key default gen_random_uuid(), submission_id uuid references submissions(id) on delete cascade, reviewer_id uuid references profiles(id), decision text not null, comment text, created_at timestamptz default now());
create table audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null, entity_type text, entity_id uuid, details jsonb, created_at timestamptz default now());

create or replace function match_chunks(query_embedding vector(768), match_count int default 5)
returns table (id uuid, doc_id uuid, content text, similarity float, valid_until date, trusted boolean)
language sql stable as $$
  select c.id, c.doc_id, c.content, 1 - (c.embedding <=> query_embedding) as similarity, d.valid_until, d.trusted
  from evidence_chunks c join evidence_docs d on d.id = c.doc_id
  order by c.embedding <=> query_embedding limit match_count;
$$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

create or replace function current_role_name() returns user_role language sql stable security definer set search_path = public as $$ select role from profiles where id = auth.uid() $$;
alter table profiles enable row level security; alter table guideline_versions enable row level security; alter table brand_rules enable row level security;
alter table approved_claims enable row level security; alter table evidence_docs enable row level security; alter table evidence_chunks enable row level security;
alter table submissions enable row level security; alter table claims enable row level security; alter table findings enable row level security;
alter table decisions enable row level security; alter table audit_logs enable row level security;

create policy "own profile or admin" on profiles for select using (id = auth.uid() or current_role_name() = 'admin');
create policy "read brand data" on guideline_versions for select using (auth.uid() is not null);
create policy "admin writes guidelines" on guideline_versions for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');
create policy "read rules" on brand_rules for select using (auth.uid() is not null);
create policy "admin writes rules" on brand_rules for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');
create policy "read approved claims" on approved_claims for select using (auth.uid() is not null);
create policy "admin writes approved claims" on approved_claims for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');
create policy "read evidence docs" on evidence_docs for select using (auth.uid() is not null);
create policy "admin writes evidence" on evidence_docs for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');
create policy "read chunks" on evidence_chunks for select using (current_role_name() in ('reviewer','admin'));
create policy "creator own or staff" on submissions for select using (creator_id = auth.uid() or current_role_name() in ('reviewer','admin'));
create policy "creator inserts own" on submissions for insert with check (creator_id = auth.uid());
create policy "claims visible with submission" on claims for select using (exists (select 1 from submissions s where s.id = submission_id and (s.creator_id = auth.uid() or current_role_name() in ('reviewer','admin'))));
create policy "findings visible with submission" on findings for select using (exists (select 1 from submissions s where s.id = submission_id and (s.creator_id = auth.uid() or current_role_name() in ('reviewer','admin'))));
create policy "staff read decisions" on decisions for select using (current_role_name() in ('reviewer','admin'));
create policy "staff write decisions" on decisions for insert with check (current_role_name() in ('reviewer','admin'));
create policy "admin reads audit" on audit_logs for select using (current_role_name() = 'admin');