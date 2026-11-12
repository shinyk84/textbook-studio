# 교과서 스튜디오 서버(8000번)를 끈다. 브라우저 화면을 닫아도 서버는 계속 켜져 있으므로, 도구 폴더나
# 작업 데이터 폴더를 복사하기 전에는 이것으로 꺼 두면 안전하다.
$connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($connection) {
    Stop-Process -Id $connection.OwningProcess -Force
    Write-Host "교과서 스튜디오를 껐습니다. 다시 쓰려면 start-studio.cmd 또는 바탕화면 아이콘을 누르세요."
} else {
    Write-Host "교과서 스튜디오가 켜져 있지 않습니다."
}
