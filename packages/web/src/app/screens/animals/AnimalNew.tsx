/** Alta de animal = primera Llegada (recogida + contacto + datos + chip + foto). */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../../lib/api';
import { AnimalFields, animalDraftErrors, animalDraftToData, emptyAnimalDraft, PhotoInput, uploadAnimalPhoto, type AnimalDraft } from '../../components/animals/AnimalFields';
import { draftErrors, draftToInput, emptyDraft, EventFields, type EventDraft } from '../../components/animals/EventFields';
import { options, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Button, Card, ErrorBox, Notice, PageHeader, Select } from '../../ui';

export default function AnimalNew() {
  return (
    <RequirePerm perm="animals:write">
      <AnimalNewInner />
    </RequirePerm>
  );
}

function AnimalNewInner() {
  const s = useSession();
  const nav = useNavigate();
  const arrivalSubtypes = s.catalogs.subtypes.filter((x) => x.typeId === 'llegada' && x.active !== false && x.code !== 'devolucion_desde_acogida' && x.code !== 'devolucion_desde_adopcion');
  const [ev, setEv] = useState<EventDraft>(() => emptyDraft(arrivalSubtypes[0]?.id ?? ''));
  const [an, setAn] = useState<AnimalDraft>(emptyAnimalDraft);
  const [photo, setPhoto] = useState<File | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [warning, setWarning] = useState<string>();
  const subtype = s.catalogs.subtypes.find((x) => x.id === ev.subtypeId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = { ...draftErrors(ev, subtype), ...animalDraftErrors(an) };
    setErrors(errs);
    if (Object.keys(errs).length || !subtype) {
      setError(new Error('Revisa los campos marcados.'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const animal = animalDraftToData(an, s.catalogs.breeds);
      if (!subtype.center && an.centerId) animal.centerId = an.centerId;
      const arrival = draftToInput(ev, subtype);
      if (!arrival.centerId && an.centerId) arrival.centerId = an.centerId;
      const res = await s.api.animals.create({ animal, arrival });
      if (photo) {
        try {
          await uploadAnimalPhoto(s.api, res.animal.id, photo);
        } catch (pe) {
          setWarning(`Ficha creada, pero la foto no se pudo subir: ${errorMessage(pe)}`);
          setBusy(false);
          setTimeout(() => nav(`/animales/${res.animal.id}`), 2500);
          return;
        }
      }
      if (an.breedText && !animal.breedId) void s.reloadCatalogs();
      else if (arrival.cityName && !s.catalogs.cities.some((c) => c.name.toLowerCase() === arrival.cityName!.toLowerCase())) void s.reloadCatalogs();
      nav(`/animales/${res.animal.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  if (!arrivalSubtypes.length) return <ErrorBox error={new Error('No hay subtipos de Llegada activos en los catálogos.')} />;

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-4" noValidate>
      <PageHeader title="Nueva llegada" subtitle="Alta de un animal: su primera llegada a la protectora." />
      <Card title="1. Llegada">
        <div className="space-y-4">
          <Select
            label="Tipo de llegada"
            value={ev.subtypeId}
            onChange={(e) => setEv((d) => ({ ...d, subtypeId: e.target.value }))}
            options={options(arrivalSubtypes)}
            error={errors.subtypeId}
          />
          <EventFields draft={ev} setDraft={setEv} subtype={subtype} errors={errors} allowDocument={false} />
        </div>
      </Card>
      <Card title="2. Datos del animal">
        <AnimalFields draft={an} setDraft={setAn} errors={errors} showCenter={!subtype?.center} />
      </Card>
      <Card title="3. Foto">
        <PhotoInput file={photo} onFile={setPhoto} />
      </Card>
      {warning && <Notice tone="warn">{warning}</Notice>}
      {error !== undefined && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={() => nav(-1)}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={busy}>
          Dar de alta
        </Button>
      </div>
    </form>
  );
}
