-- Restore serial defaults on existing installs where CREATE TABLE IF NOT EXISTS
-- left integer primary keys without their backing sequences.

CREATE SEQUENCE IF NOT EXISTS public.quinielas_id_seq;
ALTER SEQUENCE public.quinielas_id_seq OWNED BY public.quinielas.id;
ALTER TABLE public.quinielas ALTER COLUMN id SET DEFAULT nextval('public.quinielas_id_seq'::regclass);
SELECT setval('public.quinielas_id_seq', greatest(coalesce((SELECT max(id) FROM public.quinielas), 0) + 1, 1), false);

CREATE SEQUENCE IF NOT EXISTS public.selections_id_seq;
ALTER SEQUENCE public.selections_id_seq OWNED BY public.selections.id;
ALTER TABLE public.selections ALTER COLUMN id SET DEFAULT nextval('public.selections_id_seq'::regclass);
SELECT setval('public.selections_id_seq', greatest(coalesce((SELECT max(id) FROM public.selections), 0) + 1, 1), false);

CREATE SEQUENCE IF NOT EXISTS public.combinations_id_seq;
ALTER SEQUENCE public.combinations_id_seq OWNED BY public.combinations.id;
ALTER TABLE public.combinations ALTER COLUMN id SET DEFAULT nextval('public.combinations_id_seq'::regclass);
SELECT setval('public.combinations_id_seq', greatest(coalesce((SELECT max(id) FROM public.combinations), 0) + 1, 1), false);

CREATE SEQUENCE IF NOT EXISTS public.jornadas_id_seq;
ALTER SEQUENCE public.jornadas_id_seq OWNED BY public.jornadas.id;
ALTER TABLE public.jornadas ALTER COLUMN id SET DEFAULT nextval('public.jornadas_id_seq'::regclass);
SELECT setval('public.jornadas_id_seq', greatest(coalesce((SELECT max(id) FROM public.jornadas), 0) + 1, 1), false);
