"""Regression guard for the migrated built-in deck (fr-en-common).

The deck data lives in app/data/decks/fr-en-common.csv. The expected vocabulary below
was captured from the original french_words.csv when the migration ran, including its
four documented corrections (Warning/Wait/Stop/Earth lowercased). Deleting the legacy
csv file must not silently change this deck, so changes here are deliberate:
expect this test to fail and update the constant with the correction noted.
"""

from __future__ import annotations

from app.loader import slugify

# (source, target) pairs the deck must contain, in file order.
EXPECTED_VOCABULARY = [
    ('partie', 'part'),
    ('histoire', 'history'),
    ('chercher', 'search'),
    ('seulement', 'only'),
    ('police', 'police'),
    ('pensais', 'thought'),
    ('aide', 'help'),
    ('demande', 'request'),
    ('genre', 'kind'),
    ('mois', 'month'),
    ('frère', 'brother'),
    ('laisser', 'let'),
    ('car', 'because'),
    ('mettre', 'to put'),
    ('aucun', 'no'),
    ('laisse', 'leash'),
    ('eux', 'them'),
    ('ville', 'city'),
    ('chaque', 'each'),
    ('parlé', 'speak'),
    ('arrivé', 'come'),
    ('devrait', 'should'),
    ('bébé', 'baby'),
    ('longtemps', 'long time'),
    ('heures', 'hours'),
    ('vont', 'will'),
    ('pendant', 'while'),
    ('revoir', 'meet again'),
    ('aucune', 'any'),
    ('place', 'square'),
    ('parle', 'speak'),
    ('compris', 'understood'),
    ('savais', 'knew'),
    ('étaient', 'were'),
    ('attention', 'warning'),
    ('voici', 'here is'),
    ('pourrais', 'could'),
    ('affaire', 'case'),
    ('donner', 'give'),
    ('type', 'type'),
    ('leurs', 'their'),
    ('donné', 'given'),
    ('train', 'train'),
    ('corps', 'body'),
    ('endroit', 'place'),
    ('yeux', 'eyes'),
    ('façon', 'way'),
    ('écoute', 'listen'),
    ('dont', 'whose'),
    ('trouve', 'find'),
    ('premier', 'first'),
    ('perdu', 'lost'),
    ('main', 'hand'),
    ('première', 'first'),
    ('côté', 'side'),
    ('pouvoir', 'power'),
    ('vieux', 'old'),
    ('sois', 'be'),
    ('tiens', 'here'),
    ('matin', 'morning'),
    ('tellement', 'so much'),
    ('enfant', 'child'),
    ('point', 'point'),
    ('venu', 'came'),
    ('suite', 'after'),
    ('pardon', 'sorry'),
    ('venez', 'come'),
    ('devant', 'in front of'),
    ('vers', 'towards'),
    ('minutes', 'minutes'),
    ('demandé', 'request'),
    ('chambre', 'bedroom'),
    ('mis', 'placed'),
    ('belle', 'beautiful'),
    ('droit', 'law'),
    ('aimerais', 'would like to'),
    ('aujourd\'hui', 'today'),
    ('mari', 'husband'),
    ('cause', 'cause'),
    ('enfin', 'finally'),
    ('espère', 'hope'),
    ('eau', 'water'),
    ('attendez', 'wait'),
    ('parti', 'left'),
    ('nouvelle', 'new'),
    ('boulot', 'job'),
    ('arrêter', 'stop'),
    ('dirait', 'would say'),
    ('terre', 'earth'),
    ('compte', 'account'),
    ('donne', 'given'),
    ('loin', 'far'),
    ('fin', 'end'),
    ('croire', 'believe'),
    ('chérie', 'sweetheart'),
    ('gros', 'large'),
    ('plutôt', 'rather'),
    ('aura', 'will have'),
    ('filles', 'girls'),
    ('jouer', 'to play'),
    ('bureau', 'office'),
]

def test_migrated_deck_matches_the_documented_vocabulary(real_client):
    entries = real_client.get("/api/decks/fr-en-common/entries?limit=500").json()["entries"]
    assert len(entries) == len(EXPECTED_VOCABULARY) == 101
    assert [(e["source"], e["target"]) for e in entries] == EXPECTED_VOCABULARY


def test_documented_corrections_applied(real_client):
    body = real_client.get("/api/decks/fr-en-common/entries?limit=500").json()
    by_source = {e["source"]: e["target"] for e in body["entries"]}
    assert by_source["attention"] == "warning"
    assert by_source["attendez"] == "wait"
    assert by_source["arrêter"] == "stop"
    assert by_source["terre"] == "earth"


def test_entry_ids_are_stable_slugs(real_client):
    by_id = {
        e["id"]: e
        for e in real_client.get("/api/decks/fr-en-common/entries?limit=500").json()["entries"]
    }
    assert by_id["frere"]["source"] == "frère"
    assert by_id["aujourdhui"]["source"] == "aujourd'hui"
    # parle / parlé both slug to "parle" -> the second gets a -2 suffix
    assert by_id["parle"]["source"] in {"parle", "parlé"}
    assert "parle-2" in by_id


def test_duplicate_targets_are_preserved_as_distinct_entries(real_client):
    entries = real_client.get("/api/decks/fr-en-common/entries").json()["entries"]
    pairs = sorted((e["source"], e["target"]) for e in entries)
    # The five subtitle-derived duplicate translations must survive migration.
    for expected in [("parle", "speak"), ("parlé", "speak"), ("demande", "request"),
                     ("demandé", "request"), ("arrivé", "come"), ("venez", "come")]:
        assert expected in pairs, expected
