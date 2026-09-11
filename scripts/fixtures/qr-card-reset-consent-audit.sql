-- Exact current consent snapshot function and isolated audit-table schema. No live rows.
create table public.qr_bingo_entrant_consent_acceptance_audit("id" uuid default gen_random_uuid(),"entry_id" uuid,"event_key" text,"vendor_bingo_id" text,"vendor_bd_user_id" text,"couple_bd_user_id" text,"entry_method" text,"vendor_offer_version" timestamp with time zone,"consent_share_contact" boolean,"contact_share_scope" text,"consent_text" text,"consent_version" text,"consented_at" timestamp with time zone,"draw_administration_contact_share_acknowledged" boolean,"draw_administration_contact_share_acknowledged_at" timestamp with time zone,"draw_administration_contact_share_version" text,"draw_administration_contact_share_consent_text" text,"promotion_responsibility_acknowledged" boolean,"promotion_disclosure_text" text,"promotion_responsibility_acknowledged_at" timestamp with time zone,"promotion_responsibility_version" text,"age_of_majority_attested" boolean,"residency_attested" boolean,"exclusions_attested" boolean,"eligibility_attested_at" timestamp with time zone,"eligibility_attestation_text" text,"official_rules_url" text,"rules_viewed_at" timestamp with time zone,"apple_non_sponsor_acknowledged" boolean,"snapshot_reason" text,"recorded_at" timestamp with time zone default clock_timestamp(),"vendor_marketing_consent" boolean default false,"vendor_marketing_consent_text" text default ''::text,"vendor_marketing_consented_at" timestamp with time zone);
alter table public.qr_bingo_entrant_consent_acceptance_audit add constraint qr_bingo_entrant_consent_acceptance_audit_pkey PRIMARY KEY (id);
alter table public.qr_bingo_entrant_consent_acceptance_audit add constraint qr_bingo_entrant_consent_audit_marketing_proof_complete CHECK ((((NOT vendor_marketing_consent) AND (vendor_marketing_consented_at IS NULL) AND (btrim(vendor_marketing_consent_text) = ''::text)) OR (vendor_marketing_consent AND (vendor_marketing_consented_at IS NOT NULL) AND (btrim(vendor_marketing_consent_text) <> ''::text) AND (length(vendor_marketing_consent_text) <= 2000) AND (vendor_marketing_consent_text !~ '[[:cntrl:]]'::text)))) NOT VALID;
alter table public.qr_bingo_entrant_consent_acceptance_audit add constraint qr_bingo_entrant_consent_audit_reason_known CHECK ((snapshot_reason = ANY (ARRAY['initial_acceptance'::text, 'superseded_on_reconsent'::text, 'current_acceptance'::text])));
alter table public.qr_bingo_entrant_consent_acceptance_audit add constraint qr_bingo_entrant_consent_audit_scope_known CHECK ((contact_share_scope = ANY (ARRAY['selected_potential_winner_only'::text, 'named_vendor_draw_administration'::text])));
alter table public.qr_bingo_entrant_consent_acceptance_audit add constraint qr_bingo_entrant_consent_audit_snapshot_unique UNIQUE (entry_id, consented_at, consent_version, contact_share_scope);
CREATE OR REPLACE FUNCTION public.lock_active_qr_bingo_contact_member(p_member_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_member_id is null or p_member_id !~ '^[1-9][0-9]{0,17}$' then
    raise exception using errcode='22023',message='Invalid QR contact member.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact-member:'||p_member_id,0));
  if weddingwin_private.is_deleted_chat_identity(p_member_id) then
    raise exception using errcode='42501',message='This member account was deleted.';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_qr_bingo_entrant_consent_snapshot(p_entry qr_bingo_raffle_entries, p_snapshot_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.qr_bingo_entrant_consent_acceptance_audit (
    entry_id,
    event_key,
    vendor_bingo_id,
    vendor_bd_user_id,
    couple_bd_user_id,
    entry_method,
    vendor_offer_version,
    consent_share_contact,
    contact_share_scope,
    consent_text,
    consent_version,
    consented_at,
    draw_administration_contact_share_acknowledged,
    draw_administration_contact_share_acknowledged_at,
    draw_administration_contact_share_version,
    draw_administration_contact_share_consent_text,
    vendor_marketing_consent,
    vendor_marketing_consent_text,
    vendor_marketing_consented_at,
    promotion_responsibility_acknowledged,
    promotion_disclosure_text,
    promotion_responsibility_acknowledged_at,
    promotion_responsibility_version,
    age_of_majority_attested,
    residency_attested,
    exclusions_attested,
    eligibility_attested_at,
    eligibility_attestation_text,
    official_rules_url,
    rules_viewed_at,
    apple_non_sponsor_acknowledged,
    snapshot_reason
  ) values (
    p_entry.id,
    p_entry.event_key,
    p_entry.vendor_bingo_id,
    p_entry.vendor_bd_user_id,
    p_entry.couple_bd_user_id,
    p_entry.entry_method,
    p_entry.vendor_offer_version,
    p_entry.consent_share_contact,
    p_entry.contact_share_scope,
    p_entry.consent_text,
    p_entry.consent_version,
    p_entry.consented_at,
    p_entry.draw_administration_contact_share_acknowledged,
    p_entry.draw_administration_contact_share_acknowledged_at,
    p_entry.draw_administration_contact_share_version,
    p_entry.draw_administration_contact_share_consent_text,
    p_entry.vendor_marketing_consent,
    p_entry.vendor_marketing_consent_text,
    p_entry.vendor_marketing_consented_at,
    p_entry.promotion_responsibility_acknowledged,
    p_entry.promotion_disclosure_text,
    p_entry.promotion_responsibility_acknowledged_at,
    p_entry.promotion_responsibility_version,
    p_entry.age_of_majority_attested,
    p_entry.residency_attested,
    p_entry.exclusions_attested,
    p_entry.eligibility_attested_at,
    p_entry.eligibility_attestation_text,
    p_entry.official_rules_url,
    p_entry.rules_viewed_at,
    p_entry.apple_non_sponsor_acknowledged,
    p_snapshot_reason
  )
  on conflict (
    entry_id,
    consented_at,
    consent_version,
    contact_share_scope
  ) do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_qr_bingo_entrant_consent_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  acceptance_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    perform public.record_qr_bingo_entrant_consent_snapshot(
      new,
      'initial_acceptance'
    );
    return new;
  end if;

  acceptance_changed := row(
    new.vendor_offer_version,
    new.consent_share_contact,
    new.contact_share_scope,
    new.consent_text,
    new.consent_version,
    new.consented_at,
    new.draw_administration_contact_share_acknowledged,
    new.draw_administration_contact_share_acknowledged_at,
    new.draw_administration_contact_share_version,
    new.draw_administration_contact_share_consent_text,
    new.vendor_marketing_consent,
    new.vendor_marketing_consent_text,
    new.vendor_marketing_consented_at,
    new.promotion_responsibility_acknowledged,
    new.promotion_disclosure_text,
    new.promotion_responsibility_acknowledged_at,
    new.promotion_responsibility_version,
    new.age_of_majority_attested,
    new.residency_attested,
    new.exclusions_attested,
    new.eligibility_attested_at,
    new.eligibility_attestation_text,
    new.official_rules_url,
    new.rules_viewed_at,
    new.apple_non_sponsor_acknowledged
  ) is distinct from row(
    old.vendor_offer_version,
    old.consent_share_contact,
    old.contact_share_scope,
    old.consent_text,
    old.consent_version,
    old.consented_at,
    old.draw_administration_contact_share_acknowledged,
    old.draw_administration_contact_share_acknowledged_at,
    old.draw_administration_contact_share_version,
    old.draw_administration_contact_share_consent_text,
    old.vendor_marketing_consent,
    old.vendor_marketing_consent_text,
    old.vendor_marketing_consented_at,
    old.promotion_responsibility_acknowledged,
    old.promotion_disclosure_text,
    old.promotion_responsibility_acknowledged_at,
    old.promotion_responsibility_version,
    old.age_of_majority_attested,
    old.residency_attested,
    old.exclusions_attested,
    old.eligibility_attested_at,
    old.eligibility_attestation_text,
    old.official_rules_url,
    old.rules_viewed_at,
    old.apple_non_sponsor_acknowledged
  );

  if acceptance_changed then
    perform public.record_qr_bingo_entrant_consent_snapshot(
      old,
      'superseded_on_reconsent'
    );
    perform public.record_qr_bingo_entrant_consent_snapshot(
      new,
      'current_acceptance'
    );
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER audit_qr_bingo_entrant_consent_acceptance AFTER INSERT OR UPDATE ON public.qr_bingo_raffle_entries FOR EACH ROW EXECUTE FUNCTION audit_qr_bingo_entrant_consent_acceptance();
