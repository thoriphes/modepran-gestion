/** Editor de plantillas (admin): HTML relleno/en blanco, textos legales, vista previa, guardar y restaurar. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BLOCKS, LANG_KEYS, PLACEHOLDERS, renderTemplate, TEMPLATE_SLUGS, unknownPlaceholders, type Template, type TemplateSlug } from '@modepran/domain';
import { fmtDateTime } from '../../../lib/format';
import { blankData, sampleData, TEMPLATE_NAMES, templateDict, withDefaults } from '../../components/animals/docs';
import { useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Button, Card, ErrorBox, Loading, Notice, PageHeader, Tabs, TextInput } from '../../ui';

export default function TemplateEditor() {
  return (
    <RequirePerm perm="templates:write">
      <Inner />
    </RequirePerm>
  );
}

type Tab = 'filled' | 'blank' | 'legal';

function Inner() {
  const { slug } = useParams();
  const s = useSession();
  const nav = useNavigate();
  const valid = (TEMPLATE_SLUGS as readonly string[]).includes(slug ?? '');
  const res = useAsync(() => (valid ? s.api.documents.template(slug as TemplateSlug) : Promise.reject(new Error('Plantilla desconocida.'))), [slug]);
  const [draft, setDraft] = useState<Template>();
  const [tab, setTab] = useState<Tab>('filled');
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState<string>();
  const [newKey, setNewKey] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (res.data) setDraft(res.data);
  }, [res.data]);

  if (res.loading) return <Loading />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(res.data);
  const field: 'bodyFilled' | 'bodyBlank' = tab === 'blank' ? 'bodyBlank' : 'bodyFilled';
  const unknown = unknownPlaceholders(draft.bodyFilled + draft.bodyBlank);

  const insert = (token: string) => {
    if (tab === 'legal') return;
    const ta = areaRef.current;
    const text = `[${token}]`;
    const cur = draft[field];
    const start = ta?.selectionStart ?? cur.length;
    const end = ta?.selectionEnd ?? cur.length;
    setDraft({ ...draft, [field]: cur.slice(0, start) + text + cur.slice(end) });
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const t = await s.api.documents.saveTemplate(draft.slug, { name: draft.name, bodyFilled: draft.bodyFilled, bodyBlank: draft.bodyBlank, legalTexts: draft.legalTexts });
      res.setData(t);
      setSaved('Plantilla guardada.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!confirm('¿Restaurar la plantilla por defecto? Se perderán los cambios guardados en esta plantilla.')) return;
    setBusy(true);
    setError(undefined);
    try {
      const t = await s.api.documents.resetTemplate(draft.slug);
      res.setData(t);
      setSaved('Plantilla restaurada a la versión por defecto.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const previewHtml =
    tab === 'blank'
      ? renderTemplate(draft.bodyBlank, withDefaults(blankData()), templateDict(draft))
      : renderTemplate(draft.bodyFilled, withDefaults(sampleData()), templateDict(draft));

  return (
    <div>
      <PageHeader
        title={`Plantilla: ${TEMPLATE_NAMES[draft.slug] ?? draft.name}`}
        subtitle={draft.updatedAt ? `Última modificación: ${fmtDateTime(draft.updatedAt)}` : undefined}
        actions={
          <>
            <Button onClick={() => nav('/documentos')}>← Documentos</Button>
            <Button onClick={() => setPreview((p) => !p)}>{preview ? 'Ocultar vista previa' : 'Vista previa'}</Button>
            <Button variant="danger" onClick={() => void reset()} disabled={busy}>
              Restaurar por defecto
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!dirty}>
              Guardar
            </Button>
          </>
        }
      />
      {saved && !dirty && (
        <div className="mb-3">
          <Notice tone="success">{saved}</Notice>
        </div>
      )}
      {error !== undefined && (
        <div className="mb-3">
          <ErrorBox error={error} />
        </div>
      )}
      {unknown.length > 0 && (
        <div className="mb-3">
          <Notice tone="warn">Marcadores no reconocidos (saldrán tal cual): {unknown.map((u) => `[${u}]`).join(', ')}</Notice>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'filled', label: 'Rellena' },
          { value: 'blank', label: 'En blanco' },
          { value: 'legal', label: 'Textos legales', count: Object.keys(draft.legalTexts ?? {}).length },
        ]}
      />

      <div className={preview && tab !== 'legal' ? 'grid gap-4 xl:grid-cols-2' : ''}>
        {tab === 'legal' ? (
          <Card title="Textos [LANG_*] de este documento" bodyClassName="space-y-3 p-4">
            <p className="text-sm text-stone-500">
              Sustituyen a los textos por defecto solo en este documento. Admiten HTML y parámetros <code>:animal_name</code>, etc. Vacía uno para volver al texto por defecto.
            </p>
            {Object.entries(draft.legalTexts ?? {}).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label mb-0 font-mono" htmlFor={`legal-${k}`}>
                    [LANG_{k.toUpperCase()}]
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const lt = { ...draft.legalTexts };
                      delete lt[k];
                      setDraft({ ...draft, legalTexts: lt });
                    }}
                  >
                    Quitar
                  </Button>
                </div>
                <textarea id={`legal-${k}`} className="input min-h-28 font-mono text-xs" value={v} onChange={(e) => setDraft({ ...draft, legalTexts: { ...draft.legalTexts, [k]: e.target.value } })} />
              </div>
            ))}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const k = newKey.trim().toLowerCase().replace(/^lang_/, '');
                if (!k || draft.legalTexts?.[k] !== undefined) return;
                setDraft({ ...draft, legalTexts: { ...draft.legalTexts, [k]: '' } });
                setNewKey('');
              }}
            >
              <TextInput label="Añadir texto (clave)" list="lang-keys" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="lopd" />
              <datalist id="lang-keys">
                {LANG_KEYS.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
              <Button type="submit">Añadir</Button>
            </form>
          </Card>
        ) : (
          <Card bodyClassName="p-0">
            <div className="flex flex-wrap gap-1 border-b border-stone-200 p-2 dark:border-stone-800">
              <details className="w-full text-xs">
                <summary className="cursor-pointer font-medium text-stone-600 dark:text-stone-300">Insertar marcador…</summary>
                <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                  {[...PLACEHOLDERS, ...BLOCKS, ...LANG_KEYS.map((k) => `LANG_${k.toUpperCase()}`)].map((p) => (
                    <button key={p} type="button" onClick={() => insert(p)} className="rounded bg-stone-100 px-1.5 py-0.5 font-mono hover:bg-accent-100 dark:bg-stone-800 dark:hover:bg-accent-900/40">
                      [{p}]
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <label htmlFor="tpl-body" className="sr-only">
              HTML de la plantilla
            </label>
            <textarea
              id="tpl-body"
              ref={areaRef}
              spellCheck={false}
              className="block min-h-[60vh] w-full resize-y border-0 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-900 focus:outline-none dark:bg-stone-950 dark:text-stone-100"
              value={draft[field]}
              onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            />
          </Card>
        )}
        {preview && tab !== 'legal' && (
          <div className="overflow-auto rounded-xl bg-stone-200/60 p-2 dark:bg-stone-800">
            <p className="mb-2 text-xs text-stone-500">Vista previa con datos ficticios</p>
            <div className="print-sheet print-doc origin-top-left scale-[0.8]" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        )}
      </div>
    </div>
  );
}
