$KEY = "AIzaSyCGZiH2xvB5TqeKgDeaMlupI_Iqaq9El7M"
$URL = "https://places.googleapis.com/v1/places:searchText"
$HEADERS = @{
  "Content-Type" = "application/json"
  "X-Goog-Api-Key" = $KEY
  "X-Goog-FieldMask" = "places.displayName,places.formattedAddress,places.userRatingCount,places.rating,places.internationalPhoneNumber,places.websiteUri"
}
$BODY = '{"textQuery":"car dealer Surat","languageCode":"en"}'

Invoke-RestMethod -Method Post -Uri $URL -Headers $HEADERS -Body $BODY | ConvertTo-Json -Depth 5